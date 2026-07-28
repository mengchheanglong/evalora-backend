import { test } from "node:test";
import { strict as assert } from "node:assert";
import { SessionsService } from "../src/modules/sessions/sessions.service";
import { PREBUILT_ASSESSMENT_TEMPLATES, buildPrebuiltTemplateCreateData } from "../src/modules/templates/prebuilt-templates";

const expiresAt = new Date("2026-08-01T00:00:00.000Z");
const now = new Date("2026-07-06T13:00:00.000Z");

const sessionRow = {
  id: "session-1",
  candidateId: "candidate-1",
  candidate: { name: "Demo Candidate", email: "candidate@example.com" },
  templateId: "template-1",
  template: { title: "Backend Engineer Assessment", roleType: "Backend Engineer" },
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
  status: "NOT_STARTED" as const,
  startedAt: null,
  completedAt: null,
  expiresAt,
  createdAt: now,
  updatedAt: now,
};

const interviewerAccess = { userId: "interviewer-1", role: "interviewer" as const, organizationId: "org-1" };

const candidateModuleRow = {
  id: "module-1",
  moduleType: "DEBUGGING",
  title: "Debugging",
  description: "Find root causes",
  weight: 1,
  orderIndex: 1,
  settings: null,
  questions: [
    {
      id: "question-1",
      questionText: "What would you check first?",
      questionType: "SHORT_ANSWER",
      options: null,
      rubric: { criteria: ["evidence"] },
    },
  ],
};

test("createSession generates an access code and maps candidate/template assignment to Prisma", async () => {
  const calls: unknown[] = [];
  const service = new SessionsService(
    {
      interviewSession: {
        create: async (args: unknown) => {
          calls.push(args);
          return sessionRow;
        },
      },
    },
    { generateAccessCode: () => "EV-123456", now: () => now },
  );

  const result = await service.createSession({
    candidateId: "candidate-1",
    templateId: "template-1",
    organizationId: "org-1",
    expiresAt,
  });

  assert.equal(result.id, "session-1");
  assert.equal(result.candidateName, "Demo Candidate");
  assert.equal(result.templateTitle, "Backend Engineer Assessment");
  assert.equal(result.status, "not_started");
  assert.equal(result.accessCode, "EV-123456");
  assert.equal(result.expiresAt, expiresAt.toISOString());
  assert.equal(result.interviewerName, "Ada Interviewer");
  assert.equal(result.interviewerRole, "Interviewer");
  assert.equal(result.interviewers, undefined);

  assert.deepEqual(calls[0], {
    data: {
      candidateId: "candidate-1",
      templateId: "template-1",
      organizationId: "org-1",
      createdById: undefined,
      accessCode: "EV-123456",
      status: "NOT_STARTED",
      expiresAt,
      title: undefined,
      interviewType: undefined,
      interviewers: undefined,
      notes: undefined,
      targetRole: undefined,
      department: undefined,
      scheduledAt: undefined,
      durationMin: undefined,
      language: undefined,
      timeZone: undefined,
    },
    include: {
      candidate: { select: { name: true, email: true } },
      createdBy: { select: { id: true, name: true, role: true } },
      template: { select: { title: true, roleType: true, timeLimitMin: true } },
      report: { select: { overallScore: true } },
    },
  });
});

test("createSession stores frontend workspace metadata and maps interviewer labels", async () => {
  const calls: any[] = [];
  const service = new SessionsService(
    {
      assessmentTemplate: {
        findFirst: async () => ({ id: "template-1", organizationId: "org-1" }),
      },
      user: {
        findUnique: async () => ({ id: "candidate-1", role: "CANDIDATE", organizationId: "org-1" }),
        findMany: async () => [
          { id: "interviewer-2", name: "Sophia Kim", role: "INTERVIEWER", organizationId: "org-1" },
          { id: "interviewer-3", name: "Michael Chen", role: "INTERVIEWER", organizationId: "org-1" },
        ],
      },
      interviewSession: {
        create: async (args: any) => {
          calls.push(args);
          return {
            ...sessionRow,
            title: args.data.title,
            interviewType: args.data.interviewType,
            interviewers: args.data.interviewers,
            notes: args.data.notes,
            targetRole: args.data.targetRole,
            department: args.data.department,
            scheduledAt: args.data.scheduledAt,
            durationMin: args.data.durationMin,
            language: args.data.language,
            timeZone: args.data.timeZone,
            createdById: args.data.createdById,
          };
        },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now },
  );

  const result = await service.createSession(
    {
      candidateId: "candidate-1",
      templateId: "template-1",
      title: "Final Round with Dara",
      interviewType: "Technical Interview",
      interviewers: ["Sophia Kim", "Michael Chen"],
      interviewerIds: ["interviewer-2", "interviewer-3"],
      notes: "Focus on system design.",
      targetRole: "Backend Engineer",
      department: "Engineering",
      sessionDate: "2026-07-20",
      startTime: "14:30",
      durationMin: 90,
      language: "English",
      timeZone: "GMT+07:00 Phnom Penh",
    },
    interviewerAccess,
  );

  assert.equal(result.title, "Final Round with Dara");
  assert.equal(result.interviewType, "Technical Interview");
  assert.deepEqual(result.interviewers, ["Sophia Kim", "Michael Chen"]);
  assert.equal(result.interviewerName, "Sophia Kim");
  assert.equal(result.interviewerRole, "Interviewer");
  assert.equal(result.notes, "Focus on system design.");
  assert.equal(result.targetRole, "Backend Engineer");
  assert.equal(result.department, "Engineering");
  assert.equal(result.scheduledAt, "2026-07-20T14:30:00.000Z");
  assert.equal(result.durationMin, 90);
  assert.equal(result.language, "English");
  assert.equal(result.timeZone, "GMT+07:00 Phnom Penh");
  assert.equal(result.createdById, "interviewer-1");
  assert.equal(calls[0].data.createdById, "interviewer-1");
  assert.deepEqual(calls[0].data.interviewers, [
    { id: "interviewer-2", name: "Sophia Kim" },
    { id: "interviewer-3", name: "Michael Chen" },
  ]);
});

test("createSession rejects interviewer ids outside the workspace", async () => {
  let created = false;
  const service = new SessionsService({
    assessmentTemplate: {
      findFirst: async () => ({ id: "template-1", organizationId: "org-1" }),
    },
    user: {
      findUnique: async () => ({ id: "candidate-1", role: "CANDIDATE", organizationId: "org-1" }),
      findMany: async () => [],
    },
    interviewSession: {
      create: async () => {
        created = true;
        return sessionRow;
      },
    },
  } as any);

  await assert.rejects(
    () => service.createSession(
      {
        candidateId: "candidate-1",
        templateId: "template-1",
        interviewerIds: ["member-from-another-workspace"],
      },
      interviewerAccess,
    ),
    /not members of this workspace/i,
  );
  assert.equal(created, false, "an invalid assignment must be rejected before session creation");
});

test("createSession can create an invite-only candidate record from name and email", async () => {
  const calls: Array<{ method: string; args: any }> = [];
  const service = new SessionsService(
    {
      assessmentTemplate: {
        findFirst: async (args: any) => {
          calls.push({ method: "template.findFirst", args });
          return { id: "template-1", organizationId: "org-1" };
        },
      },
      user: {
        findUnique: async (args: any) => {
          calls.push({ method: "user.findUnique", args });
          return null;
        },
        create: async (args: any) => {
          calls.push({ method: "user.create", args });
          return { id: "candidate-1", name: "Demo Candidate", email: "candidate@example.com", role: "CANDIDATE", organizationId: "org-1" };
        },
      },
      interviewSession: {
        create: async (args: any) => {
          calls.push({ method: "session.create", args });
          return sessionRow;
        },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now },
  );

  const result = await service.createSession(
    {
      candidateName: "Demo Candidate",
      candidateEmail: "candidate@example.com",
      templateId: "template-1",
      expiresAt,
    },
    interviewerAccess,
  );

  assert.equal(result.candidateId, "candidate-1");
  assert.equal(calls[0].method, "template.findFirst");
  assert.equal(calls[1].method, "user.findUnique");
  assert.deepEqual(calls[1].args, {
    where: { email: "candidate@example.com" },
    select: { id: true, role: true, organizationId: true },
  });
  assert.equal(calls[2].method, "user.create");
  assert.equal(calls[2].args.data.name, "Demo Candidate");
  assert.equal(calls[2].args.data.email, "candidate@example.com");
  assert.equal(calls[2].args.data.role, "CANDIDATE");
  assert.equal(calls[2].args.data.organizationId, "org-1");
  assert.match(calls[2].args.data.passwordHash, /^\$2/);
  assert.equal(calls[3].method, "session.create");
  assert.equal(calls[3].args.data.candidateId, "candidate-1");
  assert.equal(calls[3].args.data.organizationId, "org-1");
});

test("candidate invite access code opens, starts, and completes only the assigned assessment", async () => {
  const calls: Array<{ method: string; args: any }> = [];
  let currentStatus = "NOT_STARTED";
  const service = new SessionsService(
    {
      interviewSession: {
        findFirst: async (args: any) => {
          calls.push({ method: "findFirst", args });
          return { ...sessionRow, status: currentStatus, template: { title: "Backend Engineer Assessment", roleType: "Backend Engineer", modules: [candidateModuleRow] } };
        },
        update: async (args: any) => {
          calls.push({ method: "update", args });
          currentStatus = args.data.status;
          return {
            ...sessionRow,
            status: currentStatus,
            startedAt: args.data.startedAt ?? null,
            completedAt: args.data.completedAt ?? null,
            template: { title: "Backend Engineer Assessment", roleType: "Backend Engineer", modules: [candidateModuleRow] },
          };
        },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now },
  );

  const opened = await service.getSessionByAccessCode(" ev-123456 ");
  const started = await service.startSessionByAccessCode("EV-123456");
  const completed = await service.completeSessionByAccessCode("EV-123456");

  assert.equal(opened.id, "session-1");
  assert.equal(opened.template.modules[0].questions?.[0].questionText, "What would you check first?");
  assert.equal(started.status, "in_progress");
  assert.equal(completed.status, "completed");
  assert.deepEqual(calls.map((call) => call.method), ["findFirst", "findFirst", "update", "findFirst", "update"]);
  assert.deepEqual(calls[0].args.where, { accessCode: "EV-123456" });
});

test("candidate access delivers authored questions except generated-only AI interview seeds", async () => {
  for (const definition of PREBUILT_ASSESSMENT_TEMPLATES) {
    const seeded = buildPrebuiltTemplateCreateData(definition, { createdById: "seed-user", organizationId: "org-1" });
    const template = {
      ...seeded,
      modules: seeded.modules.create.map((module) => ({ ...module, questions: module.questions.create })),
    };
    const service = new SessionsService({
      interviewSession: {
        findFirst: async () => ({ ...sessionRow, template }),
      },
    } as any);

    const opened = await service.getSessionByAccessCode(`access-${definition.id}`);
    const expectedQuestionIds = definition.modules.flatMap((module) => (
      module.type === "ai_interview" ? [] : module.questions.map((question) => question.id)
    ));
    const deliveredQuestionIds = opened.template.modules.flatMap((module) => (module.questions ?? []).map((question) => question.id));

    assert.deepEqual(opened.template.modules.map((module) => module.id), definition.modules.map((module) => module.id), `${definition.title} module order changed`);
    assert.deepEqual(deliveredQuestionIds, expectedQuestionIds, `${definition.title} did not deliver its complete question bank`);
    assert.ok(opened.template.modules.flatMap((module) => module.questions ?? []).every((question) => question.rubric === undefined), "candidate DTO must not expose private rubrics");
  }
});

test("candidate invite access code is closed after completion", async () => {
  const service = new SessionsService({
    interviewSession: {
      findFirst: async () => ({ ...sessionRow, status: "COMPLETED" }),
    },
  } as any);

  await assert.rejects(() => service.getSessionByAccessCode("EV-123456"), /no longer available/i);
});

const timedTemplate = { title: "Backend Engineer Assessment", roleType: "Backend Engineer", timeLimitMin: 30, modules: [candidateModuleRow] };

test("expireSessionByAccessCode marks a timed-out in-progress session as EXPIRED", async () => {
  const calls: Array<{ method: string; args: any }> = [];
  const startedAt = new Date(now.getTime() - 60 * 60_000); // started 60 min ago; 30 min limit elapsed
  const service = new SessionsService(
    {
      interviewSession: {
        findFirst: async (args: any) => {
          calls.push({ method: "findFirst", args });
          return { ...sessionRow, status: "IN_PROGRESS", startedAt, template: timedTemplate };
        },
        update: async (args: any) => {
          calls.push({ method: "update", args });
          return { ...sessionRow, status: args.data.status, startedAt, template: timedTemplate };
        },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now },
  );

  const result = await service.expireSessionByAccessCode("EV-123456");

  assert.equal(result.status, "expired");
  const updateCall = calls.find((call) => call.method === "update");
  assert.ok(updateCall, "update should be called");
  assert.equal(updateCall.args.data.status, "EXPIRED");
});

test("expireSessionByAccessCode rejects before the time limit has elapsed", async () => {
  const updates: string[] = [];
  const service = new SessionsService(
    {
      interviewSession: {
        findFirst: async () => ({ ...sessionRow, status: "IN_PROGRESS", startedAt: now, template: timedTemplate }),
        update: async () => { updates.push("update"); return sessionRow; },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now },
  );

  await assert.rejects(() => service.expireSessionByAccessCode("EV-123456"), /not elapsed/i);
  assert.equal(updates.length, 0);
});

test("expireSessionByAccessCode does not downgrade a completed session", async () => {
  const updates: string[] = [];
  const service = new SessionsService(
    {
      interviewSession: {
        findFirst: async () => ({ ...sessionRow, status: "COMPLETED", startedAt: new Date(now.getTime() - 60 * 60_000), completedAt: now, template: timedTemplate }),
        update: async () => { updates.push("update"); return sessionRow; },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now },
  );

  const result = await service.expireSessionByAccessCode("EV-123456");

  assert.equal(result.status, "completed");
  assert.equal(updates.length, 0);
});

test("listSessions lazily expires an in-progress session past its time limit", async () => {
  const updateManyCalls: any[] = [];
  const startedAt = new Date(now.getTime() - 60 * 60_000); // 60 min ago, 30 min limit
  const service = new SessionsService(
    {
      interviewSession: {
        findMany: async () => [
          { ...sessionRow, id: "timed-out", status: "IN_PROGRESS", startedAt, template: { title: "T", roleType: "R", timeLimitMin: 30 } },
          { ...sessionRow, id: "still-going", status: "IN_PROGRESS", startedAt: now, template: { title: "T", roleType: "R", timeLimitMin: 30 } },
        ],
        updateMany: async (args: any) => { updateManyCalls.push(args); return { count: 1 }; },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now },
  );

  const result = await service.listSessions();

  assert.equal(updateManyCalls.length, 1);
  assert.deepEqual(updateManyCalls[0].where.id, { in: ["timed-out"] });
  assert.equal(updateManyCalls[0].where.status, "IN_PROGRESS");
  assert.equal(updateManyCalls[0].data.status, "EXPIRED");
  assert.equal(result.find((session) => session.id === "timed-out")?.status, "expired");
  assert.equal(result.find((session) => session.id === "still-going")?.status, "in_progress");
});

test("listSessions does not auto-expire a session within the clock-skew grace just past its deadline", async () => {
  const updateManyCalls: any[] = [];
  // timeLimitMin = 30. "within-grace" is 2s past the deadline (inside the 5s
  // grace); "past-grace" is 8s past. Only the latter may be auto-expired, so an
  // interviewer read at the boundary can't reject a candidate's final answer.
  const withinGraceStart = new Date(now.getTime() - 30 * 60_000 - 2_000);
  const pastGraceStart = new Date(now.getTime() - 30 * 60_000 - 8_000);
  const service = new SessionsService(
    {
      interviewSession: {
        findMany: async () => [
          { ...sessionRow, id: "within-grace", status: "IN_PROGRESS", startedAt: withinGraceStart, template: { title: "T", roleType: "R", timeLimitMin: 30 } },
          { ...sessionRow, id: "past-grace", status: "IN_PROGRESS", startedAt: pastGraceStart, template: { title: "T", roleType: "R", timeLimitMin: 30 } },
        ],
        updateMany: async (args: any) => { updateManyCalls.push(args); return { count: 1 }; },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now },
  );

  const result = await service.listSessions();

  assert.equal(updateManyCalls.length, 1);
  assert.deepEqual(updateManyCalls[0].where.id, { in: ["past-grace"] });
  assert.equal(result.find((session) => session.id === "within-grace")?.status, "in_progress");
  assert.equal(result.find((session) => session.id === "past-grace")?.status, "expired");
});

test("deleteSession removes a session scoped to the caller's organization", async () => {
  const calls: any[] = [];
  const service = new SessionsService(
    {
      interviewSession: {
        deleteMany: async (args: any) => { calls.push(args); return { count: 1 }; },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now },
  );

  await service.deleteSession("session-1", interviewerAccess);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].where, { id: "session-1", organizationId: "org-1" });
});

test("deleteSession rejects when nothing matches the caller's scope", async () => {
  let deleteCalled = false;
  const service = new SessionsService(
    {
      interviewSession: {
        deleteMany: async () => { deleteCalled = true; return { count: 0 }; },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now },
  );

  await assert.rejects(() => service.deleteSession("session-x", interviewerAccess));
  assert.equal(deleteCalled, true);
});

test("startSession and completeSession write status timestamps through Prisma", async () => {
  const calls: unknown[] = [];
  const service = new SessionsService(
    {
      interviewSession: {
        update: async (args: unknown) => {
          calls.push(args);
          return {
            ...sessionRow,
            status: calls.length === 1 ? ("IN_PROGRESS" as const) : ("COMPLETED" as const),
            startedAt: now,
            completedAt: calls.length === 1 ? null : now,
          };
        },
      },
    },
    { generateAccessCode: () => "EV-123456", now: () => now },
  );

  const started = await service.startSession("session-1");
  const completed = await service.completeSession("session-1");

  assert.equal(started.status, "in_progress");
  assert.equal(started.startedAt, now.toISOString());
  assert.equal(completed.status, "completed");
  assert.equal(completed.completedAt, now.toISOString());

  assert.deepEqual(calls, [
    {
      where: { id: "session-1" },
      data: { status: "IN_PROGRESS", startedAt: now },
      include: {
        candidate: { select: { name: true, email: true } },
        createdBy: { select: { id: true, name: true, role: true } },
        template: { select: { title: true, roleType: true, timeLimitMin: true } },
        report: { select: { overallScore: true } },
      },
    },
    {
      where: { id: "session-1" },
      data: { status: "COMPLETED", completedAt: now },
      include: {
        candidate: { select: { name: true, email: true } },
        createdBy: { select: { id: true, name: true, role: true } },
        template: { select: { title: true, roleType: true, timeLimitMin: true } },
        report: { select: { overallScore: true } },
      },
    },
  ]);
});

test("completion is blocked while a required interviewer follow-up is unanswered", async () => {
  let updated = false;
  const prisma = {
    interviewSession: {
      findFirst: async () => ({ ...sessionRow, status: "IN_PROGRESS", startedAt: now }),
      update: async () => {
        updated = true;
        return { ...sessionRow, status: "COMPLETED" };
      },
    },
    interviewerFollowUp: {
      count: async (args: any) => {
        // Only required + still-sent questions may block submission.
        assert.deepEqual(args.where, { sessionId: "session-1", required: true, status: "SENT" });
        return 1;
      },
    },
  } as any;

  const service = new SessionsService(prisma, { generateAccessCode: () => "EV-123456", now: () => now });

  await assert.rejects(
    () => service.completeSession("session-1", interviewerAccess),
    (err: any) => {
      assert.equal(err.getStatus(), 409);
      assert.equal(err.getResponse().code, "INTERVIEWER_FOLLOW_UP_REQUIRED");
      return true;
    },
  );
  await assert.rejects(() => service.completeSessionByAccessCode("EV-123456"), (err: any) => err.getStatus() === 409);
  assert.equal(updated, false, "the session must not be completed while a required question is pending");
});

test("completion proceeds when no required interviewer follow-up is pending", async () => {
  const prisma = {
    interviewSession: {
      findFirst: async () => ({ ...sessionRow, status: "IN_PROGRESS", startedAt: now }),
      update: async (args: any) => ({ ...sessionRow, status: args.data.status, completedAt: now }),
    },
    // Optional or already-answered questions leave the count at zero.
    interviewerFollowUp: { count: async () => 0 },
  } as any;

  const service = new SessionsService(prisma, { generateAccessCode: () => "EV-123456", now: () => now });
  const completed = await service.completeSession("session-1", interviewerAccess);
  assert.equal(completed.status, "completed");
});

test("completeSession rejects a not-started session with 409 Conflict (not a 500)", async () => {
  const service = new SessionsService({
    interviewSession: {
      findFirst: async () => ({ ...sessionRow, status: "NOT_STARTED", startedAt: null }),
    },
  } as any);

  await assert.rejects(
    () => service.completeSession("session-1", interviewerAccess),
    (err: any) => {
      assert.equal(err.getStatus(), 409, "wrong-state transition must be 409, not 500");
      assert.match(err.message, /start the session/i);
      return true;
    },
  );
});

test("startSession rejects an already-completed session with 409 Conflict (not a 500)", async () => {
  const service = new SessionsService({
    interviewSession: {
      findFirst: async () => ({ ...sessionRow, status: "COMPLETED", startedAt: now, completedAt: now }),
    },
  } as any);

  await assert.rejects(
    () => service.startSession("session-1", interviewerAccess),
    (err: any) => {
      assert.equal(err.getStatus(), 409);
      assert.match(err.message, /not-started session can be started/i);
      return true;
    },
  );
});

test("listSessions rejects an invalid status filter with 400 before querying (not a 500)", async () => {
  let queried = false;
  const service = new SessionsService({
    interviewSession: {
      findMany: async () => {
        queried = true;
        return [];
      },
    },
  } as any);

  await assert.rejects(
    () => service.listSessions({ status: "garbage" as never }),
    (err: any) => {
      assert.equal(err.getStatus(), 400, "invalid enum filter must be 400, not a Prisma 500");
      assert.match(err.message, /invalid session status/i);
      return true;
    },
  );
  assert.equal(queried, false, "must reject before hitting Prisma");
});

test("listSessions and getSession map Prisma rows to API DTOs", async () => {
  const service = new SessionsService({
    interviewSession: {
      findMany: async () => [{ ...sessionRow, status: "IN_PROGRESS" as const, startedAt: now }],
      findUnique: async () => ({ ...sessionRow, status: "COMPLETED" as const, startedAt: now, completedAt: now }),
    },
  });

  const sessions = await service.listSessions({ organizationId: "org-1" });
  const session = await service.getSession("session-1");

  assert.equal(sessions[0].status, "in_progress");
  assert.equal(sessions[0].candidateEmail, "candidate@example.com");
  assert.equal(session?.status, "completed");
  assert.equal(session?.templateTitle, "Backend Engineer Assessment");
});

// The wire name is asserted as a literal on purpose: it is a published contract
// the frontend listens for, so renaming the backend constant must fail here.
const SESSION_UPDATED = "session.updated";

/**
 * Fake live channel. `order` interleaves writes and emissions so a test can prove
 * the broadcast happened AFTER the row was committed, never before.
 */
function createEventRecorder() {
  const events: Array<{ sessionId: string; event: string; payload: any }> = [];
  const order: string[] = [];
  return {
    events,
    order,
    publisher: {
      emitToSession(sessionId: string, event: string, payload: unknown) {
        order.push("emit");
        events.push({ sessionId, event, payload: payload as any });
      },
    },
  };
}

test("staff start and complete broadcast session.updated once each, after the write", async () => {
  const recorder = createEventRecorder();
  const service = new SessionsService(
    {
      interviewSession: {
        update: async (args: any) => {
          recorder.order.push("write");
          return {
            ...sessionRow,
            status: args.data.status,
            startedAt: now,
            completedAt: args.data.completedAt ?? null,
          };
        },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now, events: recorder.publisher },
  );

  await service.startSession("session-1");
  await service.completeSession("session-1");

  assert.deepEqual(recorder.order, ["write", "emit", "write", "emit"], "every broadcast follows its committed write");
  // Status is lowercase on the wire, exactly like the REST DTOs and the re-join
  // snapshot — the raw Prisma enum must never reach a client.
  assert.deepEqual(recorder.events, [
    {
      sessionId: "session-1",
      event: SESSION_UPDATED,
      payload: { sessionId: "session-1", status: "in_progress", startedAt: now.toISOString(), completedAt: undefined },
    },
    {
      sessionId: "session-1",
      event: SESSION_UPDATED,
      payload: { sessionId: "session-1", status: "completed", startedAt: now.toISOString(), completedAt: now.toISOString() },
    },
  ]);
});

test("candidate start, submit, and timeout each broadcast session.updated", async () => {
  const recorder = createEventRecorder();
  const startedAt = new Date(now.getTime() - 60 * 60_000); // 60 min ago; 30 min limit elapsed
  let currentStatus = "NOT_STARTED";
  const service = new SessionsService(
    {
      interviewSession: {
        findFirst: async () => ({ ...sessionRow, status: currentStatus, startedAt, template: timedTemplate }),
        update: async (args: any) => {
          recorder.order.push("write");
          currentStatus = args.data.status;
          return {
            ...sessionRow,
            status: currentStatus,
            startedAt,
            completedAt: args.data.completedAt ?? null,
            template: timedTemplate,
          };
        },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now, events: recorder.publisher },
  );

  await service.startSessionByAccessCode("EV-123456");
  await service.completeSessionByAccessCode("EV-123456");
  currentStatus = "IN_PROGRESS"; // the candidate's countdown fires on a session still open
  await service.expireSessionByAccessCode("EV-123456");

  assert.deepEqual(recorder.order, ["write", "emit", "write", "emit", "write", "emit"]);
  assert.deepEqual(
    recorder.events.map((entry) => [entry.event, entry.payload.status]),
    [
      [SESSION_UPDATED, "in_progress"],
      [SESSION_UPDATED, "completed"],
      [SESSION_UPDATED, "expired"],
    ],
  );
  assert.equal(recorder.events[2].payload.sessionId, "session-1");
  assert.equal(recorder.events[1].payload.completedAt, now.toISOString());
});

test("lazy auto-expiry broadcasts session.updated only for the sessions it flipped", async () => {
  const recorder = createEventRecorder();
  const startedAt = new Date(now.getTime() - 60 * 60_000);
  const service = new SessionsService(
    {
      interviewSession: {
        findMany: async () => [
          { ...sessionRow, id: "timed-out", status: "IN_PROGRESS", startedAt, template: { title: "T", roleType: "R", timeLimitMin: 30 } },
          { ...sessionRow, id: "still-going", status: "IN_PROGRESS", startedAt: now, template: { title: "T", roleType: "R", timeLimitMin: 30 } },
        ],
        updateMany: async () => {
          recorder.order.push("write");
          return { count: 1 };
        },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now, events: recorder.publisher },
  );

  await service.listSessions();

  assert.deepEqual(recorder.order, ["write", "emit"]);
  assert.equal(recorder.events.length, 1, "a session still within its limit is not announced as expired");
  assert.deepEqual(recorder.events[0], {
    sessionId: "timed-out",
    event: SESSION_UPDATED,
    payload: { sessionId: "timed-out", status: "expired", startedAt: startedAt.toISOString(), completedAt: undefined },
  });
});

test("lazy auto-expiry stays silent when the guarded write flipped nothing", async () => {
  const recorder = createEventRecorder();
  const service = new SessionsService(
    {
      interviewSession: {
        findMany: async () => [
          { ...sessionRow, id: "timed-out", status: "IN_PROGRESS", startedAt: new Date(now.getTime() - 60 * 60_000), template: { title: "T", roleType: "R", timeLimitMin: 30 } },
        ],
        // A concurrent completion already took the row out of IN_PROGRESS.
        updateMany: async () => ({ count: 0 }),
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now, events: recorder.publisher },
  );

  await service.listSessions();

  assert.equal(recorder.events.length, 0);
});

test("a no-op transition writes nothing and broadcasts nothing", async () => {
  const recorder = createEventRecorder();
  const service = new SessionsService(
    {
      interviewSession: {
        findFirst: async () => ({ ...sessionRow, status: "COMPLETED", startedAt: now, completedAt: now }),
        update: async () => {
          throw new Error("an already-completed session must not be written again");
        },
      },
    } as any,
    { generateAccessCode: () => "EV-123456", now: () => now, events: recorder.publisher },
  );

  const completed = await service.completeSession("session-1", interviewerAccess);

  assert.equal(completed.status, "completed");
  assert.equal(recorder.events.length, 0, "no write means nothing to announce");
});

test("a failing live channel never fails a committed session write", async () => {
  let written = false;
  const service = new SessionsService(
    {
      interviewSession: {
        update: async (args: any) => {
          written = true;
          return { ...sessionRow, status: args.data.status, startedAt: now, completedAt: now };
        },
      },
    } as any,
    {
      generateAccessCode: () => "EV-123456",
      now: () => now,
      events: {
        emitToSession() {
          throw new Error("the socket server is down");
        },
      },
    },
  );

  const completed = await service.completeSession("session-1");

  assert.equal(written, true);
  assert.equal(completed.status, "completed", "the candidate's submission still succeeds");
});

test("session creation rejects a template outside the authenticated organization", async () => {
  let created = false;
  const service = new SessionsService({
    assessmentTemplate: { findFirst: async () => null },
    interviewSession: { create: async () => { created = true; return sessionRow; } },
  } as any);

  await assert.rejects(
    () => service.createSession({ candidateId: "candidate-1", templateId: "template-other" }, interviewerAccess),
    /template not found or access denied/i,
  );
  assert.equal(created, false);
});
