import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as jwt from "jsonwebtoken";
import type { Socket } from "socket.io";
import { TOKEN_PURPOSES } from "../src/modules/auth/auth.guard";
import { InterviewGateway, isAllowedRealtimeOrigin } from "../src/modules/realtime/interview.gateway";

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
    emit(_event: string, payload: { message?: string }) {
      socket.errors.push(payload?.message ?? "");
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
