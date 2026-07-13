import { test } from "node:test";
import { strict as assert } from "node:assert";
import { SessionsService } from "../src/modules/sessions/sessions.service";

const expiresAt = new Date("2026-08-01T00:00:00.000Z");
const now = new Date("2026-07-06T13:00:00.000Z");

const sessionRow = {
  id: "session-1",
  candidateId: "candidate-1",
  candidate: { name: "Demo Candidate", email: "candidate@example.com" },
  templateId: "template-1",
  template: { title: "Backend Engineer Assessment", roleType: "Backend Engineer" },
  createdById: "interviewer-1",
  createdBy: { id: "interviewer-1", name: "Ada Interviewer", role: "INTERVIEWER" },
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
  status: "NOT_STARTED",
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
      template: { select: { title: true, roleType: true } },
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
  assert.deepEqual(calls[0].data.interviewers, ["Sophia Kim", "Michael Chen"]);
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

test("candidate invite access code is closed after completion", async () => {
  const service = new SessionsService({
    interviewSession: {
      findFirst: async () => ({ ...sessionRow, status: "COMPLETED" }),
    },
  } as any);

  await assert.rejects(() => service.getSessionByAccessCode("EV-123456"), /no longer available/i);
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
            status: calls.length === 1 ? "IN_PROGRESS" : "COMPLETED",
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
        template: { select: { title: true, roleType: true } },
        report: { select: { overallScore: true } },
      },
    },
    {
      where: { id: "session-1" },
      data: { status: "COMPLETED", completedAt: now },
      include: {
        candidate: { select: { name: true, email: true } },
        createdBy: { select: { id: true, name: true, role: true } },
        template: { select: { title: true, roleType: true } },
        report: { select: { overallScore: true } },
      },
    },
  ]);
});

test("listSessions and getSession map Prisma rows to API DTOs", async () => {
  const service = new SessionsService({
    interviewSession: {
      findMany: async () => [{ ...sessionRow, status: "IN_PROGRESS", startedAt: now }],
      findUnique: async () => ({ ...sessionRow, status: "COMPLETED", startedAt: now, completedAt: now }),
    },
  });

  const sessions = await service.listSessions({ organizationId: "org-1" });
  const session = await service.getSession("session-1");

  assert.equal(sessions[0].status, "in_progress");
  assert.equal(sessions[0].candidateEmail, "candidate@example.com");
  assert.equal(session?.status, "completed");
  assert.equal(session?.templateTitle, "Backend Engineer Assessment");
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
