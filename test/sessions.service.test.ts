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
  template: { title: "Backend Engineer Assessment" },
  organizationId: "org-1",
  accessCode: "EV-123456",
  status: "NOT_STARTED",
  startedAt: null,
  completedAt: null,
  expiresAt,
  createdAt: now,
  updatedAt: now,
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
      accessCode: "EV-123456",
      status: "NOT_STARTED",
      expiresAt,
    },
    include: {
      candidate: { select: { name: true, email: true } },
      template: { select: { title: true } },
    },
  });
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
        template: { select: { title: true } },
      },
    },
    {
      where: { id: "session-1" },
      data: { status: "COMPLETED", completedAt: now },
      include: {
        candidate: { select: { name: true, email: true } },
        template: { select: { title: true } },
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
