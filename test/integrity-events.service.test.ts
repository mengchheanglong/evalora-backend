import { test } from "node:test";
import { strict as assert } from "node:assert";
import { INTERVIEW_EVENTS } from "../src/modules/realtime/realtime.types";
import { InterviewGateway } from "../src/modules/realtime/interview.gateway";
import { SessionsService } from "../src/modules/sessions/sessions.service";

const now = new Date("2026-07-06T13:00:00.000Z");
const expiresAt = new Date("2036-08-01T00:00:00.000Z");

const candidateTemplateRow = {
  id: "template-1",
  title: "Backend Engineer Assessment",
  description: "Assessment",
  roleType: "Backend Engineer",
  timeLimitMin: 30,
  scoringRules: null,
  createdById: "interviewer-1",
  organizationId: "org-1",
  modules: [],
};

function candidateSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    candidateId: "candidate-1",
    candidate: { name: "Demo Candidate", email: "candidate@example.com" },
    templateId: "template-1",
    template: candidateTemplateRow,
    createdById: "interviewer-1",
    createdBy: { id: "interviewer-1", name: "Ada Interviewer", role: "INTERVIEWER" as const },
    title: null,
    interviewType: null,
    interviewers: null,
    notes: null,
    targetRole: null,
    department: null,
    scheduledAt: null,
    durationMin: null,
    language: null,
    timeZone: null,
    organizationId: "org-1",
    accessCode: "EV-123456",
    status: "IN_PROGRESS" as const,
    startedAt: now,
    completedAt: null,
    expiresAt,
    // Two-strike policy: the default warning limit is 2 counted violations.
    warningCount: 0,
    warningLimit: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * In-memory Prisma stand-in that keeps the session mutable, enforces the
 * (sessionId, clientEventId) unique key, and exposes `$transaction` so the real
 * atomic write path is exercised.
 */
function createFakePrisma(initialSession = candidateSessionRow()) {
  const events: Array<Record<string, unknown>> = [];
  let session: Record<string, unknown> = { ...initialSession };

  const prisma = {
    interviewSession: {
      findFirst: async (): Promise<Record<string, unknown> | null> => ({ ...session }),
      findUnique: async () => ({
        id: session.id,
        status: session.status,
        warningCount: session.warningCount,
        warningLimit: session.warningLimit,
      }),
      update: async (args: any) => {
        const data = { ...(args.data as Record<string, unknown>) };
        // Prisma's atomic `{ increment: 1 }` shape: apply it like the database would.
        if (data.warningCount && typeof data.warningCount === "object") {
          const increment = (data.warningCount as { increment?: number }).increment ?? 0;
          data.warningCount = Number(session.warningCount ?? 0) + increment;
        }
        session = { ...session, ...data };
        return { ...session };
      },
    },
    integrityEvent: {
      findUnique: async (args: any) => {
        const key = args.where.sessionId_clientEventId;
        return events.find((event) => event.sessionId === key.sessionId && event.clientEventId === key.clientEventId) ?? null;
      },
      create: async (args: any) => {
        const row = { id: `evt-${events.length + 1}`, ...(args.data as Record<string, unknown>) };
        events.push(row);
        return row;
      },
      findMany: async () => events.map((event) => ({ ...event })),
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(prisma),
  };

  return {
    prisma,
    events,
    session: () => ({ ...session }),
  };
}

function createService(prisma: unknown, events?: unknown) {
  return new SessionsService(prisma as never, { now: () => now, events: events as never });
}

const uuid = "0f4e3b2a-1111-4222-8333-444455556666";

const visibilityEvent = {
  clientEventId: uuid,
  type: "visibilitychange" as const,
  detectedAt: "2026-07-06T13:05:00.000Z",
  returnedAt: "2026-07-06T13:05:30.000Z",
  durationMs: 30_000,
};

test("the first valid counted event warns once and keeps the session ACTIVE", async () => {
  const { prisma, events, session } = createFakePrisma();
  const emitted: Array<{ sessionId: string; event: string; payload: any }> = [];
  const publisher = {
    emitToSession: (sessionId: string, event: string, payload: unknown) => emitted.push({ sessionId, event, payload: payload as any }),
  };
  const service = createService(prisma, publisher);

  const result = await service.recordIntegrityEvent("EV-123456", visibilityEvent);

  assert.equal(result.counted, true);
  assert.equal(result.warningCount, 1);
  assert.equal(result.warningLimit, 2);
  assert.equal(result.sessionStatus, "in_progress", "the session must stay active after the first strike");
  assert.equal(result.action, "warned");
  assert.match(result.reason, /Possible tab switching detected\./);
  assert.equal(result.event.type, "visibilitychange");
  assert.equal(result.event.detectedAt, "2026-07-06T13:05:00.000Z");
  assert.equal(result.event.returnedAt, "2026-07-06T13:05:30.000Z");
  assert.equal(result.event.durationMs, 30_000);

  assert.equal(events.length, 1);
  assert.equal(events[0].counted, true);
  assert.equal(session().warningCount, 1);
  assert.equal(session().status, "IN_PROGRESS", "enforcement keeps the session active at strike one");

  // The warning decision still fans out through the authorized session room.
  const integrityBroadcast = emitted.filter((item) => item.event === INTERVIEW_EVENTS.integrityUpdated);
  assert.equal(integrityBroadcast.length, 1);
  assert.equal(integrityBroadcast[0].sessionId, "session-1");
  assert.equal(integrityBroadcast[0].payload.warningCount, 1);
  assert.equal(integrityBroadcast[0].payload.warningLimit, 2);
  assert.equal(integrityBroadcast[0].payload.status, "in_progress");
  assert.equal(integrityBroadcast[0].payload.action, "warned");
  // No session.updated broadcast: the status did not change.
  assert.equal(emitted.some((item) => item.event === INTERVIEW_EVENTS.sessionUpdated), false);
});

test("the second valid counted event ends the session", async () => {
  const { prisma, events, session } = createFakePrisma();
  const service = createService(prisma);

  const first = await service.recordIntegrityEvent("EV-123456", visibilityEvent);
  assert.equal(first.warningCount, 1);
  assert.equal(first.sessionStatus, "in_progress");

  const second = await service.recordIntegrityEvent("EV-123456", {
    ...visibilityEvent,
    clientEventId: "9c8d7e6f-2222-4333-8444-555566667777",
    detectedAt: "2026-07-06T13:10:00.000Z",
    returnedAt: "2026-07-06T13:10:30.000Z",
  });

  assert.equal(second.counted, true);
  assert.equal(second.warningCount, 2);
  assert.equal(second.warningLimit, 2);
  assert.equal(second.sessionStatus, "expired", "the second strike expires the session server-side");
  assert.equal(second.action, "terminated");
  assert.equal(events.length, 2);
  assert.equal(session().warningCount, 2);
  assert.equal(session().status, "EXPIRED");
});

test("a third event is rejected because the session is no longer active", async () => {
  const { prisma, events } = createFakePrisma();
  const service = createService(prisma);

  await service.recordIntegrityEvent("EV-123456", visibilityEvent);
  await service.recordIntegrityEvent("EV-123456", {
    ...visibilityEvent,
    clientEventId: "9c8d7e6f-2222-4333-8444-555566667777",
  });

  await assert.rejects(
    () =>
      service.recordIntegrityEvent("EV-123456", {
        ...visibilityEvent,
        clientEventId: "5a4b3c2d-3333-4444-8555-666677778888",
      }),
    /no longer available/i,
    "after the second strike the session is expired and rejects further events",
  );
  assert.equal(events.length, 2, "the third event is never stored");
});

test("retrying the same clientEventId never counts a second warning", async () => {
  const { prisma, events, session } = createFakePrisma();
  const service = createService(prisma);

  const first = await service.recordIntegrityEvent("EV-123456", visibilityEvent);
  assert.equal(first.warningCount, 1);
  assert.equal(first.action, "warned");
  assert.equal(first.sessionStatus, "in_progress");

  // Same clientEventId replayed while the session is still active: must not
  // increment, must not end the session.
  const retried = await service.recordIntegrityEvent("EV-123456", visibilityEvent);
  assert.equal(retried.counted, false);
  assert.equal(retried.warningCount, 1);
  assert.equal(retried.sessionStatus, "in_progress");
  assert.equal(retried.action, "duplicate");
  assert.match(retried.reason, /Duplicate integrity event\./);
  assert.equal(events.length, 1, "the duplicate is never stored a second time");
  assert.equal(session().warningCount, 1, "warningCount increments exactly once");

  // A NEW violation is the second strike and ends the interview.
  const second = await service.recordIntegrityEvent("EV-123456", {
    ...visibilityEvent,
    clientEventId: "9c8d7e6f-2222-4333-8444-555566667777",
  });
  assert.equal(second.warningCount, 2);
  assert.equal(second.sessionStatus, "expired");
  assert.equal(events.length, 2);
});

test("blur and other supporting signals are stored but never counted", async () => {
  const { prisma, events, session } = createFakePrisma();
  const service = createService(prisma);

  const blur = await service.recordIntegrityEvent("EV-123456", {
    clientEventId: "a1b2c3d4-3333-4111-8222-999900001111",
    type: "blur",
    detectedAt: "2026-07-06T13:06:00.000Z",
  });

  assert.equal(blur.counted, false);
  assert.equal(blur.warningCount, 0);
  assert.equal(blur.sessionStatus, "in_progress");
  assert.equal(blur.action, "recorded");
  assert.match(blur.reason, /window lost focus/);
  assert.equal(events.length, 1);
  assert.equal(events[0].counted, false);
  assert.equal(session().warningCount, 0, "supporting evidence never increments the official count");
});

test("completed and expired sessions reject new integrity events", async () => {
  for (const status of ["COMPLETED", "EXPIRED"]) {
    const { prisma } = createFakePrisma(candidateSessionRow({ status }));
    const service = createService(prisma);
    await assert.rejects(
      () => service.recordIntegrityEvent("EV-123456", visibilityEvent),
      /no longer available/i,
      `${status} must reject integrity events`,
    );
  }

  // A session that never started is not active either.
  const { prisma } = createFakePrisma(candidateSessionRow({ status: "NOT_STARTED" }));
  const service = createService(prisma);
  await assert.rejects(() => service.recordIntegrityEvent("EV-123456", visibilityEvent), /in-progress session accepts integrity events/i);
});

test("an expired invitation rejects events even while in progress", async () => {
  const { prisma } = createFakePrisma(
    candidateSessionRow({ expiresAt: new Date("2026-01-01T00:00:00.000Z") }),
  );
  const service = createService(prisma);
  await assert.rejects(() => service.recordIntegrityEvent("EV-123456", visibilityEvent), /invitation has expired/i);
});

test("candidate access-code validation rejects unknown or blank codes", async () => {
  const { prisma } = createFakePrisma();
  prisma.interviewSession.findFirst = async () => null;
  const service = createService(prisma);

  await assert.rejects(() => service.recordIntegrityEvent("EV-NOPE", visibilityEvent), /not found or access denied/i);
  await assert.rejects(() => service.recordIntegrityEvent("", visibilityEvent), /Access code is required/i);
});

test("invalid event types are rejected by the DTO whitelist, which also blocks enforcement fields", async () => {
  const { plainToInstance, validateSync } = await import("class-transformer").then(async (transformer) => {
    const validator = await import("class-validator");
    return { plainToInstance: transformer.plainToInstance, validateSync: validator.validateSync };
  });
  const { ReportIntegrityEventDto } = await import("../src/modules/sessions/dto/report-integrity-event.dto");

  const validate = (input: Record<string, unknown>) =>
    validateSync(plainToInstance(ReportIntegrityEventDto, input, { enableImplicitConversion: true }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  const valid = validate({ ...visibilityEvent });
  assert.equal(valid.length, 0, "a well-formed visibilitychange payload passes");

  const badType = validate({ ...visibilityEvent, type: "keylogger" });
  assert.ok(badType.length > 0, "unknown event types are rejected");

  // The browser can never author enforcement state: these fields are not even
  // part of the DTO, so whitelisting rejects them before the service runs.
  const forged = validate({ ...visibilityEvent, warningCount: 99, sessionStatus: "completed", action: "terminated" });
  assert.ok(forged.length > 0, "warningCount/sessionStatus/action are rejected as unknown fields");

  const missingId = validate({ type: "visibilitychange", detectedAt: visibilityEvent.detectedAt });
  assert.ok(missingId.length > 0, "clientEventId is required");

  const badDetectedAt = validate({ ...visibilityEvent, detectedAt: "not-a-date" });
  assert.ok(badDetectedAt.length > 0, "detectedAt must be a valid ISO timestamp");
});

test("a cross-organization reviewer cannot read another workspace's integrity timeline", async () => {
  const foreignAccess = { userId: "int-2", role: "interviewer" as const, organizationId: "org-2" };
  const { prisma, events } = createFakePrisma();
  events.push({
    id: "evt-1",
    sessionId: "session-1",
    clientEventId: uuid,
    type: "visibilitychange",
    detectedAt: now,
    counted: true,
    reason: "Possible tab switching detected.",
  });

  // Ownership is enforced by the where clause: the foreign reviewer's org never
  // matches, so the service sees no session and denies the read.
  const scoped = {
    ...prisma,
    interviewSession: {
      ...prisma.interviewSession,
      findFirst: async (args: any) => {
        const where = args.where ?? {};
        return where.organizationId === "org-1" ? candidateSessionRow() : null;
      },
    },
  };

  const service = createService(scoped);
  await assert.rejects(() => service.getIntegrityEvents("session-1", foreignAccess), /not found or access denied/i);

  // The same reviewer's own workspace can read the timeline.
  const ownerAccess = { userId: "int-1", role: "interviewer" as const, organizationId: "org-1" };
  const summary = await service.getIntegrityEvents("session-1", ownerAccess);
  assert.equal(summary.warningCount, 0);
  assert.equal(summary.warningLimit, 2);
  assert.equal(summary.status, "in_progress");
  assert.equal(summary.events.length, 1);
  assert.equal(summary.events[0].type, "visibilitychange");
});

test("reviewer and candidate see the same official warning count after each strike", async () => {
  const { prisma } = createFakePrisma();
  const service = createService(prisma);

  const first = await service.recordIntegrityEvent("EV-123456", visibilityEvent);
  const summaryAfterFirst = await service.getIntegrityEvents("session-1");
  assert.equal(first.warningCount, summaryAfterFirst.warningCount, "both channels report 1 after the first strike");
  assert.equal(summaryAfterFirst.status, "in_progress");

  await service.recordIntegrityEvent("EV-123456", {
    ...visibilityEvent,
    clientEventId: "9c8d7e6f-2222-4333-8444-555566667777",
  });
  const summaryAfterSecond = await service.getIntegrityEvents("session-1");
  assert.equal(summaryAfterSecond.warningCount, 2, "the reviewer timeline carries the same official count");
  assert.equal(summaryAfterSecond.warningLimit, 2);
  assert.equal(summaryAfterSecond.status, "expired");
  assert.equal(summaryAfterSecond.events.length, 2);
});

test("integrity.updated is emitted only into the authorized session room", () => {
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const server = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ room, event, payload });
      },
    }),
  };

  const gateway = new InterviewGateway({} as never);
  (gateway as unknown as { server: typeof server }).server = server;

  gateway.emitToSession("session-1", INTERVIEW_EVENTS.integrityUpdated, { sessionId: "session-1", warningCount: 1 });

  // The room name is scoped to THIS session, so sockets in any other session
  // room (or the global namespace) can never receive it.
  assert.deepEqual(emitted, [
    { room: "session:session-1", event: "integrity.updated", payload: { sessionId: "session-1", warningCount: 1 } },
  ]);
});
