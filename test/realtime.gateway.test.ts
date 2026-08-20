import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as jwt from "jsonwebtoken";
import type { Socket } from "socket.io";
import { TOKEN_PURPOSES } from "../src/modules/auth/auth.guard";
import { InterviewGateway, isAllowedRealtimeOrigin } from "../src/modules/realtime/interview.gateway";
import { INTERVIEW_EVENTS } from "../src/modules/realtime/realtime.types";

// The gateway resolves the signing secret from the environment at handshake time.
process.env.JWT_SECRET = "gateway-test-secret";

const claims = { sub: "user-1", email: "long@example.com", role: "organization", organizationId: "org-1" };

function signToken(purpose: string | undefined) {
  return jwt.sign(purpose ? { ...claims, purpose } : claims, process.env.JWT_SECRET as string);
}

function fakeSocket(auth: Record<string, unknown>) {
  const socket = {
    handshake: { auth },
    disconnected: false,
    errors: [] as string[],
    joinedRooms: [] as string[],
    emit(_event: string, payload: { message?: string }) {
      socket.errors.push(payload?.message ?? "");
    },
    join(room: string) {
      socket.joinedRooms.push(room);
    },
    disconnect() {
      socket.disconnected = true;
    },
  };
  return socket;
}

async function connect(auth: Record<string, unknown>) {
  const gateway = new InterviewGateway({} as never);
  const socket = fakeSocket(auth);
  gateway.handleConnection(socket as unknown as Socket);
  // Handshake authentication is async; let it settle before asserting.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return socket;
}

async function connectWith(
  gateway: InterviewGateway,
  auth: Record<string, unknown>,
) {
  const socket = fakeSocket(auth);
  gateway.handleConnection(socket as unknown as Socket);
  // Handshake authentication is async; let it settle before asserting.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return socket;
}

/**
 * Gateway wired to fake prisma + fake Socket.IO server so join/room
 * authorization can be exercised without a real database or socket.
 */
function candidateGateway() {
  const sessions: Record<
    string,
    {
      id: string;
      organizationId: string;
      candidateId: string;
      candidate: { name: string };
    }
  > = {
    AAA111: {
      id: "session-a",
      organizationId: "org-1",
      candidateId: "candidate-1",
      candidate: { name: "Alice" },
    },
    BBB222: {
      id: "session-b",
      organizationId: "org-1",
      candidateId: "candidate-2",
      candidate: { name: "Bob" },
    },
  };

  const fakePrisma = {
    interviewSession: {
      findFirst: async ({
        where,
      }: {
        where: { accessCode: string };
      }) => sessions[where.accessCode] ?? null,
      findUnique: async ({
        where,
      }: {
        where: { id: string };
      }) => {
        const session = sessions[where.id];
        return session
          ? {
              id: session.id,
              status: "IN_PROGRESS",
              startedAt: new Date(),
              completedAt: null,
              expiresAt: null,
            }
          : null;
      },
    },
    interviewerFollowUp: {
      findMany: async () => [],
    },
  };

  const fakeServer = {
    to() {
      return { emit() {} };
    },
    sockets: new Map(),
    adapter: { rooms: new Map() },
  };

  const gateway = new InterviewGateway(fakePrisma as never);
  (gateway as unknown as { server: unknown }).server = fakeServer;
  return gateway;
}

test("a realtime ticket opens the socket handshake", async () => {
  const socket = await connect({ ticket: signToken(TOKEN_PURPOSES.realtimeTicket) });

  assert.equal(socket.disconnected, false);
  assert.deepEqual(socket.errors, []);
});

test("a session token is refused as a browser ticket but still works on the non-browser token path", async () => {
  const sessionToken = signToken(TOKEN_PURPOSES.session);

  const asTicket = await connect({ ticket: sessionToken });
  assert.equal(asTicket.disconnected, true);

  const asToken = await connect({ token: sessionToken });
  assert.equal(asToken.disconnected, false);
});

test("a password reset token cannot open the socket", async () => {
  const socket = await connect({ ticket: signToken(TOKEN_PURPOSES.passwordReset) });

  assert.equal(socket.disconnected, true);
});

test("realtime origin policy honours the configured allow-list", () => {
  const allowList = ["https://app.evalora.io"];

  assert.equal(isAllowedRealtimeOrigin("https://app.evalora.io", allowList), true);
  // Trailing slash and casing are cosmetic, not a different origin.
  assert.equal(isAllowedRealtimeOrigin("https://APP.evalora.io/", allowList), true);
  assert.equal(isAllowedRealtimeOrigin("https://attacker.example.com", allowList), false);
});

test("realtime origin policy keeps the LAN demo working", () => {
  const allowList = ["https://app.evalora.io"];

  // The candidate's phone reaches the host by its LAN address, which is never
  // listed in FRONTEND_URL.
  assert.equal(isAllowedRealtimeOrigin("http://192.168.1.42:3010", allowList), true);
  assert.equal(isAllowedRealtimeOrigin("http://10.0.0.7:3010", allowList), true);
  assert.equal(isAllowedRealtimeOrigin("http://172.16.4.9:3010", allowList), true);
  assert.equal(isAllowedRealtimeOrigin("http://localhost:3010", allowList), true);
  // Non-browser clients send no Origin header at all.
  assert.equal(isAllowedRealtimeOrigin(undefined, allowList), true);
  // A public host that merely looks private-ish is still rejected.
  assert.equal(isAllowedRealtimeOrigin("http://172.32.1.1:3010", allowList), false);
  assert.equal(isAllowedRealtimeOrigin("http://192.168.1.42.attacker.com", allowList), false);
});

test("realtime origin policy falls back to any origin when none is configured", () => {
  assert.equal(isAllowedRealtimeOrigin("https://anything.example.com", []), true);
});

test("integrity.updated is emitted only to the authorized session room", () => {
  const emitted: Array<{ room: string; event: string }> = [];

  const gateway = new InterviewGateway({} as never);
  (gateway as unknown as { server: unknown }).server = {
    to(room: string) {
      return {
        emit(event: string) {
          emitted.push({ room, event });
        },
      };
    },
  };

  gateway.emitToSession("session-a", INTERVIEW_EVENTS.integrityUpdated, {
    sessionId: "session-a",
    warningCount: 2,
    warningLimit: 2,
    status: "expired",
    action: "terminated",
    reason: "Possible tab switching detected.",
  });

  // The event goes to session:session-a and nowhere else — no broadcast.
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].room, "session:session-a");
  assert.equal(emitted[0].event, "integrity.updated");
});

test("integrity.updated carries a pointer_exit reason only to the authorized room", () => {
  const emitted: Array<{ room: string; event: string; payload: Record<string, unknown> }> = [];

  const gateway = new InterviewGateway({} as never);
  (gateway as unknown as { server: unknown }).server = {
    to(room: string) {
      return {
        emit(event: string, payload: Record<string, unknown>) {
          emitted.push({ room, event, payload });
        },
      };
    },
  };

  gateway.emitToSession("session-a", INTERVIEW_EVENTS.integrityUpdated, {
    sessionId: "session-a",
    warningCount: 1,
    warningLimit: 2,
    status: "in_progress",
    action: "warned",
    reason: "Pointer left the assessment window.",
    event: {
      id: "evt-1",
      sessionId: "session-a",
      clientEventId: "evt-1",
      type: "pointer_exit",
      detectedAt: "2026-07-06T13:05:00.000Z",
      counted: true,
      reason: "Pointer left the assessment window.",
    },
  });

  assert.equal(emitted.length, 1, "one emit, no broadcast to other rooms or the namespace");
  assert.equal(emitted[0].room, "session:session-a");
  assert.equal(emitted[0].event, "integrity.updated");
  assert.equal(emitted[0].payload.reason, "Pointer left the assessment window.");
  assert.equal((emitted[0].payload.event as { type: string }).type, "pointer_exit");
});

test("a candidate joins only their own session room via the access code", async () => {
  const gateway = candidateGateway();
  const socket = await connectWith(gateway, {
    accessCode: "AAA111",
  });

  assert.equal(socket.disconnected, false);
  assert.deepEqual(socket.errors, []);

  const result = await gateway.joinSession(
    socket as unknown as Socket,
    { accessCode: "AAA111" },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(socket.joinedRooms, ["session:session-a"]);
});

test("cross-session access is denied: a candidate cannot join another candidate's session", async () => {
  const gateway = candidateGateway();
  const socket = await connectWith(gateway, {
    accessCode: "AAA111",
  });

  const result = await gateway.joinSession(
    socket as unknown as Socket,
    { accessCode: "BBB222" },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(socket.joinedRooms, []);
  // The denial must not kill the socket itself — the candidate keeps their
  // own session connection.
  assert.equal(socket.disconnected, false);
});
