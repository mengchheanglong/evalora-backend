import { test } from "node:test";
import { strict as assert } from "node:assert";
import { TemplatesService } from "../src/modules/templates/templates.service";
import { SessionsService } from "../src/modules/sessions/sessions.service";
import { ResponsesService } from "../src/modules/responses/responses.service";

const orgAccess = { userId: "org-user-1", role: "organization" as const, organizationId: "org-1" };
const candidateAccess = { userId: "candidate-1", role: "candidate" as const };

const templateRow = {
  id: "template-1",
  title: "Backend Engineer Assessment",
  description: "Technical backend screen",
  roleType: "Backend Engineer",
  timeLimitMin: 60,
  scoringRules: null,
  createdById: "org-user-1",
  organizationId: "org-1",
  modules: [],
};

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
  expiresAt: null,
  createdAt: new Date("2026-07-06T15:00:00.000Z"),
  updatedAt: new Date("2026-07-06T15:00:00.000Z"),
};

const responseRow = {
  id: "response-1",
  sessionId: "session-1",
  questionId: "question-1",
  responseText: "Candidate answer",
  responseJson: null,
  createdAt: new Date("2026-07-06T15:01:00.000Z"),
};

test("template reads are scoped to the authenticated organization", async () => {
  const calls: unknown[] = [];
  const service = new TemplatesService({
    assessmentTemplate: {
      findMany: async (args: unknown) => {
        calls.push({ method: "findMany", args });
        return [templateRow];
      },
      findFirst: async (args: unknown) => {
        calls.push({ method: "findFirst", args });
        return templateRow;
      },
    },
  } as any);

  await (service as any).listTemplates({ access: orgAccess });
  await (service as any).getTemplate("template-1", orgAccess);

  assert.deepEqual(calls, [
    {
      method: "findMany",
      args: {
        where: { organizationId: "org-1" },
        include: { modules: { include: { questions: true }, orderBy: { orderIndex: "asc" } } },
        orderBy: { updatedAt: "desc" },
      },
    },
    {
      method: "findFirst",
      args: {
        where: { id: "template-1", organizationId: "org-1" },
        include: { modules: { include: { questions: true }, orderBy: { orderIndex: "asc" } } },
      },
    },
  ]);
});

test("organization session lists and candidate session reads are scoped by ownership", async () => {
  const calls: unknown[] = [];
  const service = new SessionsService({
    interviewSession: {
      findMany: async (args: unknown) => {
        calls.push({ method: "findMany", args });
        return [sessionRow];
      },
      findFirst: async (args: unknown) => {
        calls.push({ method: "findFirst", args });
        return sessionRow;
      },
    },
  } as any);

  await (service as any).listSessions({}, orgAccess);
  await (service as any).getSession("session-1", candidateAccess);

  assert.deepEqual(calls, [
    {
      method: "findMany",
      args: {
        where: { organizationId: "org-1" },
        include: { candidate: { select: { name: true, email: true } }, template: { select: { title: true } } },
        orderBy: { updatedAt: "desc" },
      },
    },
    {
      method: "findFirst",
      args: {
        where: { id: "session-1", candidateId: "candidate-1" },
        include: { candidate: { select: { name: true, email: true } }, template: { select: { title: true } } },
      },
    },
  ]);
});

test("candidate response autosave checks assigned session ownership before writing", async () => {
  const calls: unknown[] = [];
  const service = new ResponsesService({
    interviewSession: {
      findFirst: async (args: unknown) => {
        calls.push({ method: "session.findFirst", args });
        return sessionRow;
      },
    },
    response: {
      findFirst: async (args: unknown) => {
        calls.push({ method: "response.findFirst", args });
        return null;
      },
      create: async (args: unknown) => {
        calls.push({ method: "response.create", args });
        return responseRow;
      },
      findMany: async (args: unknown) => {
        calls.push({ method: "response.findMany", args });
        return [responseRow];
      },
    },
  } as any);

  await (service as any).saveResponse(
    { sessionId: "session-1", questionId: "question-1", responseText: "Candidate answer" },
    candidateAccess,
  );
  await (service as any).listResponsesBySession("session-1", candidateAccess);

  assert.deepEqual(calls, [
    {
      method: "session.findFirst",
      args: { where: { id: "session-1", candidateId: "candidate-1" } },
    },
    {
      method: "response.findFirst",
      args: { where: { sessionId: "session-1", questionId: "question-1" }, orderBy: { createdAt: "desc" } },
    },
    {
      method: "response.create",
      args: {
        data: {
          sessionId: "session-1",
          questionId: "question-1",
          responseText: "Candidate answer",
          responseJson: undefined,
        },
      },
    },
    {
      method: "response.findMany",
      args: {
        where: { sessionId: "session-1", session: { candidateId: "candidate-1" } },
        orderBy: { createdAt: "asc" },
      },
    },
  ]);
});
