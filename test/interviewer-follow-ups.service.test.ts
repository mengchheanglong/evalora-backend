import { test } from "node:test";
import { strict as assert } from "node:assert";
import { InterviewerFollowUpsService } from "../src/modules/interviewer-follow-ups/interviewer-follow-ups.service";
import type { AccessContext } from "../src/modules/auth/access-control";
import { INTERVIEW_EVENTS, type InterviewEventPublisher } from "../src/modules/realtime/realtime.types";

const ownerAccess: AccessContext = { userId: "owner-1", role: "organization", organizationId: "org-1" };
const interviewerAccess: AccessContext = { userId: "int-1", role: "interviewer", organizationId: "org-1" };
const otherOrgAccess: AccessContext = { userId: "out-1", role: "organization", organizationId: "org-2" };

type Row = {
  id: string;
  sessionId: string;
  moduleId?: string | null;
  parentQuestionId?: string | null;
  askedById: string;
  askedBy?: { id: string; name: string } | null;
  questionText: string;
  answerText?: string | null;
  required: boolean;
  sequence: number;
  status: "SENT" | "ANSWERED" | "CANCELLED";
  idempotencyKey?: string | null;
  sentAt?: Date | null;
  answerSavedAt?: Date | null;
  answeredAt?: Date | null;
  cancelledAt?: Date | null;
};

/** In-memory stand-in for the Prisma client surface the service uses. */
function createFakePrisma(options: { sessionStatus?: Row["status"] | "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED" } = {}) {
  const rows: Row[] = [];
  const session = {
    id: "session-1",
    organizationId: "org-1",
    accessCode: "EV-123456",
    status: (options.sessionStatus ?? "IN_PROGRESS") as "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED",
    expiresAt: null as Date | null,
    template: {
      modules: [
        { id: "module-1", questions: [{ id: "question-1" }, { id: "question-2" }] },
        { id: "module-2", questions: [{ id: "question-3" }] },
      ],
    },
  };

  const matchesWhere = (row: Row, where: any) =>
    (where.id === undefined || row.id === where.id) &&
    (where.sessionId === undefined || row.sessionId === where.sessionId) &&
    (where.idempotencyKey === undefined || row.idempotencyKey === where.idempotencyKey) &&
    (where.required === undefined || row.required === where.required) &&
    (where.status === undefined || row.status === where.status);

  const prisma = {
    session,
    rows,
    interviewSession: {
      async findFirst(args: any) {
        const where = args?.where ?? {};
        // Ownership scoping: a foreign organizationId must not match.
        if (where.organizationId !== undefined && where.organizationId !== session.organizationId) return null;
        if (where.id !== undefined && where.id !== session.id) return null;
        if (where.accessCode !== undefined && where.accessCode !== session.accessCode) return null;
        return session as any;
      },
    },
    interviewerFollowUp: {
      async findMany(args: any) {
        return rows
          .filter((row) => matchesWhere(row, args?.where ?? {}))
          .sort((a, b) => a.sequence - b.sequence);
      },
      async findFirst(args: any) {
        return rows.find((row) => matchesWhere(row, args?.where ?? {})) ?? null;
      },
      async create(args: any) {
        const data = args.data;
        if (data.idempotencyKey && rows.some((row) => row.sessionId === data.sessionId && row.idempotencyKey === data.idempotencyKey)) {
          const error = new Error("duplicate") as Error & { code?: string };
          error.code = "P2002";
          throw error;
        }
        const row: Row = {
          id: `follow-up-${rows.length + 1}`,
          askedBy: { id: data.askedById, name: "QA Interviewer" },
          sentAt: new Date(),
          ...data,
        };
        rows.push(row);
        return row;
      },
      async update(args: any) {
        const row = rows.find((candidate) => candidate.id === args.where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, args.data);
        return row;
      },
      async count(args: any) {
        return rows.filter((row) => matchesWhere(row, args?.where ?? {})).length;
      },
      async aggregate(args: any) {
        const scoped = rows.filter((row) => matchesWhere(row, args?.where ?? {}));
        return { _max: { sequence: scoped.reduce((max, row) => Math.max(max, row.sequence), 0) } };
      },
    },
  };

  return prisma;
}

function createService(prisma: ReturnType<typeof createFakePrisma>) {
  return new InterviewerFollowUpsService(prisma as never);
}

/**
 * Mirrors the completion gate enforced in sessions.service.ts
 * (assertNoPendingRequiredFollowUps): only required, still-SENT questions block
 * a submission. Asserted against stored rows rather than a service method so the
 * gating rule keeps exactly one implementation.
 */
function pendingRequired(prisma: ReturnType<typeof createFakePrisma>): number {
  return prisma.rows.filter((row) => row.required && row.status === "SENT").length;
}

const validQuestion = "What monitoring signal would make you stop the rollout?";

test("owner and interviewer can send a follow-up to a session in their organization", async () => {
  const prisma = createFakePrisma();
  const service = createService(prisma);

  const owned = await service.send("session-1", { questionText: validQuestion, parentQuestionId: "question-1" }, ownerAccess);
  assert.equal(owned.status, "sent");
  assert.equal(owned.sequence, 1);
  assert.equal(owned.required, true, "questions are required unless explicitly optional");
  assert.equal(owned.moduleId, "module-1", "module is inferred from the parent question");

  const second = await service.send("session-1", { questionText: "Second question for the candidate." }, interviewerAccess);
  assert.equal(second.sequence, 2, "sequence increments per session");
});

test("a user from another organization cannot read or send follow-ups", async () => {
  const prisma = createFakePrisma();
  const service = createService(prisma);

  await assert.rejects(() => service.listForSession("session-1", otherOrgAccess), /not found or access denied/i);
  await assert.rejects(() => service.send("session-1", { questionText: validQuestion }, otherOrgAccess), /not found or access denied/i);
  assert.equal(prisma.rows.length, 0, "nothing is written for a foreign organization");
});

test("send validates question text and template membership", async () => {
  const prisma = createFakePrisma();
  const service = createService(prisma);

  await assert.rejects(() => service.send("session-1", { questionText: "  " }, ownerAccess), /write a follow-up question/i);
  await assert.rejects(() => service.send("session-1", { questionText: "hi" }, ownerAccess), /write a follow-up question/i);
  await assert.rejects(
    () => service.send("session-1", { questionText: "x".repeat(2_001) }, ownerAccess),
    /under 2000 characters/i,
  );
  await assert.rejects(
    () => service.send("session-1", { questionText: validQuestion, parentQuestionId: "question-from-other-template" }, ownerAccess),
    /does not belong to this session/i,
  );
  await assert.rejects(
    () => service.send("session-1", { questionText: validQuestion, moduleId: "module-from-other-template" }, ownerAccess),
    /module does not belong/i,
  );
  // question-3 lives in module-2, so pairing it with module-1 is rejected
  await assert.rejects(
    () => service.send("session-1", { questionText: validQuestion, moduleId: "module-1", parentQuestionId: "question-3" }, ownerAccess),
    /does not belong to the selected module/i,
  );
  assert.equal(prisma.rows.length, 0);
});

test("questions cannot be sent to a session that is not in progress", async () => {
  for (const status of ["NOT_STARTED", "COMPLETED", "EXPIRED"] as const) {
    const service = createService(createFakePrisma({ sessionStatus: status }));
    await assert.rejects(
      () => service.send("session-1", { questionText: validQuestion }, ownerAccess),
      /no longer accepts questions/i,
      `status ${status} must be rejected`,
    );
  }
});

test("a repeated idempotency key returns the original question instead of duplicating", async () => {
  const prisma = createFakePrisma();
  const service = createService(prisma);

  const first = await service.send("session-1", { questionText: validQuestion, idempotencyKey: "key-1" }, ownerAccess);
  const retry = await service.send("session-1", { questionText: validQuestion, idempotencyKey: "key-1" }, ownerAccess);

  assert.equal(retry.id, first.id);
  assert.equal(prisma.rows.length, 1, "only one question is queued for the candidate");
});

test("candidate autosave keeps the question pending; submitting marks it answered", async () => {
  const prisma = createFakePrisma();
  const service = createService(prisma);
  const sent = await service.send("session-1", { questionText: validQuestion }, ownerAccess);

  const draft = await service.answerByAccessCode("EV-123456", sent.id, { answerText: "partial thought", submit: false });
  assert.equal(draft.status, "sent", "an autosaved draft must not count as answered");
  assert.ok(draft.answerSavedAt);
  assert.equal(pendingRequired(prisma), 1);

  const submitted = await service.answerByAccessCode("EV-123456", sent.id, { answerText: "Final answer.", submit: true });
  assert.equal(submitted.status, "answered");
  assert.ok(submitted.answeredAt);
  assert.equal(pendingRequired(prisma), 0);
});

test("a blank final answer is rejected and cancelled questions cannot be answered", async () => {
  const prisma = createFakePrisma();
  const service = createService(prisma);
  const sent = await service.send("session-1", { questionText: validQuestion }, ownerAccess);

  await assert.rejects(
    () => service.answerByAccessCode("EV-123456", sent.id, { answerText: "   ", submit: true }),
    /write an answer/i,
  );

  await service.cancel("session-1", sent.id, ownerAccess);
  await assert.rejects(
    () => service.answerByAccessCode("EV-123456", sent.id, { answerText: "too late", submit: true }),
    /withdrawn by the interviewer/i,
  );
  assert.equal(pendingRequired(prisma), 0, "a cancelled question never blocks submission");
});

test("an answered question cannot be cancelled", async () => {
  const service = createService(createFakePrisma());
  const sent = await service.send("session-1", { questionText: validQuestion }, ownerAccess);
  await service.answerByAccessCode("EV-123456", sent.id, { answerText: "Answered already.", submit: true });

  await assert.rejects(() => service.cancel("session-1", sent.id, ownerAccess), /already answered/i);
});

test("optional questions never block completion; required pending ones do", async () => {
  const prisma = createFakePrisma();
  const service = createService(prisma);
  await service.send("session-1", { questionText: "Optional extra question?", required: false }, ownerAccess);
  assert.equal(pendingRequired(prisma), 0);

  await service.send("session-1", { questionText: validQuestion, required: true }, ownerAccess);
  assert.equal(pendingRequired(prisma), 1);
});

test("the candidate projection hides interviewer identity beyond the display name", async () => {
  const service = createService(createFakePrisma());
  await service.send("session-1", { questionText: validQuestion }, ownerAccess);

  const [candidateView] = await service.listByAccessCode("EV-123456");
  assert.equal(candidateView.askedBy.name, "QA Interviewer");
  assert.equal((candidateView.askedBy as { id?: string }).id, undefined, "candidates never receive the interviewer user id");
});

test("candidate endpoints reject an unknown access code", async () => {
  const service = createService(createFakePrisma());
  await assert.rejects(() => service.listByAccessCode("EV-NOPE"), /not found or access denied/i);
});

test("questions and submitted answers fan out through the shared realtime publisher", async () => {
  const emitted: Array<{ sessionId: string; event: string }> = [];
  // Typed as the transport contract so this test fails if the shape drifts from
  // the one the gateway and sessions.service publish through.
  const events: InterviewEventPublisher = {
    emitToSession(sessionId, event) {
      emitted.push({ sessionId, event });
    },
  };
  const service = new InterviewerFollowUpsService(createFakePrisma() as never, events);

  const sent = await service.send("session-1", { questionText: validQuestion }, ownerAccess);
  await service.answerByAccessCode("EV-123456", sent.id, { answerText: "Draft only", submit: false });
  await service.answerByAccessCode("EV-123456", sent.id, { answerText: "Final answer.", submit: true });

  assert.deepEqual(
    emitted.map((entry) => entry.event),
    [INTERVIEW_EVENTS.questionSent, INTERVIEW_EVENTS.questionAnswered],
    "an autosaved draft stays private until the candidate sends it",
  );
  assert.ok(emitted.every((entry) => entry.sessionId === "session-1"));
});
