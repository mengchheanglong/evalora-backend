import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ResponsesService } from "../src/modules/responses/responses.service";

const createdAt = new Date("2026-07-06T14:00:00.000Z");

const responseRow = {
  id: "response-1",
  sessionId: "session-1",
  questionId: "question-1",
  responseText: "Initial answer",
  responseJson: { confidence: 3 },
  createdAt,
};

const accessSessionRow = {
  id: "session-1",
  accessCode: "EV-123456",
  status: "IN_PROGRESS",
  expiresAt: new Date("2026-08-01T00:00:00.000Z"),
};

test("saveResponse creates a new answer when no existing session/question response exists", async () => {
  const calls: unknown[] = [];
  const service = new ResponsesService({
    interviewSession: {
      findFirst: async (args: unknown) => {
        calls.push({ method: "session.findFirst", args });
        return assignedSessionRow();
      },
    },
    response: {
      findFirst: async (args: unknown) => {
        calls.push({ method: "findFirst", args });
        return null;
      },
      create: async (args: unknown) => {
        calls.push({ method: "create", args });
        return responseRow;
      },
    },
  });

  const result = await service.saveResponse({
    sessionId: "session-1",
    questionId: "question-1",
    responseText: "Initial answer",
    responseJson: { confidence: 3 },
  });

  assert.equal(result.id, "response-1");
  assert.equal(result.sessionId, "session-1");
  assert.equal(result.questionId, "question-1");
  assert.deepEqual(result.responseJson, { confidence: 3 });
  assert.equal(result.savedAt, createdAt.toISOString());

  assert.deepEqual(calls, [
    { method: "session.findFirst", args: { where: { id: "session-1" } } },
    { method: "session.findFirst", args: assignmentLookupArgs() },
    {
      method: "findFirst",
      args: { where: { sessionId: "session-1", questionId: "question-1" }, orderBy: { createdAt: "desc" } },
    },
    {
      method: "create",
      args: {
        data: {
          sessionId: "session-1",
          questionId: "question-1",
          responseText: "Initial answer",
          responseJson: { confidence: 3 },
        },
      },
    },
  ]);
});

test("saveResponse updates an existing session/question response for autosave", async () => {
  const calls: unknown[] = [];
  const service = new ResponsesService({
    interviewSession: {
      findFirst: async (args: unknown) => {
        calls.push({ method: "session.findFirst", args });
        return assignedSessionRow();
      },
    },
    response: {
      findFirst: async (args: unknown) => {
        calls.push({ method: "findFirst", args });
        return responseRow;
      },
      update: async (args: unknown) => {
        calls.push({ method: "update", args });
        return { ...responseRow, responseText: "Updated answer", responseJson: { confidence: 5 } };
      },
    },
  });

  const result = await service.saveResponse({
    sessionId: "session-1",
    questionId: "question-1",
    responseText: "Updated answer",
    responseJson: { confidence: 5 },
  });

  assert.equal(result.id, "response-1");
  assert.equal(result.responseText, "Updated answer");
  assert.deepEqual(result.responseJson, { confidence: 5 });

  assert.deepEqual(calls, [
    { method: "session.findFirst", args: { where: { id: "session-1" } } },
    { method: "session.findFirst", args: assignmentLookupArgs() },
    {
      method: "findFirst",
      args: { where: { sessionId: "session-1", questionId: "question-1" }, orderBy: { createdAt: "desc" } },
    },
    {
      method: "update",
      args: {
        where: { id: "response-1" },
        data: {
          responseText: "Updated answer",
          responseJson: { confidence: 5 },
        },
      },
    },
  ]);
});

test("listResponsesBySession maps saved responses to API DTOs", async () => {
  const service = new ResponsesService({
    response: {
      findMany: async (args: unknown) => {
        assert.deepEqual(args, { where: { sessionId: "session-1" }, orderBy: { createdAt: "asc" }, take: 500 });
        return [responseRow, { ...responseRow, id: "response-2", questionId: null, responseJson: null }];
      },
    },
  });

  const responses = await service.listResponsesBySession("session-1");

  assert.equal(responses.length, 2);
  assert.equal(responses[0].questionId, "question-1");
  assert.equal(responses[1].questionId, undefined);
  assert.equal(responses[1].responseJson, undefined);
});

test("saveResponseByAccessCode autosaves by invite code without candidate login", async () => {
  const calls: Array<{ method: string; args: any }> = [];
  const service = new ResponsesService({
    interviewSession: {
      findFirst: async (args: any) => {
        calls.push({ method: "session.findFirst", args });
        return assignedSessionRow();
      },
    },
    response: {
      findFirst: async (args: any) => {
        calls.push({ method: "response.findFirst", args });
        return null;
      },
      create: async (args: any) => {
        calls.push({ method: "response.create", args });
        return { ...responseRow, responseText: "Candidate answer", responseJson: null };
      },
    },
  } as any);

  const result = await service.saveResponseByAccessCode(" ev-123456 ", {
    questionId: "question-1",
    responseText: "Candidate answer",
  });

  assert.equal(result.sessionId, "session-1");
  assert.deepEqual(calls, [
    { method: "session.findFirst", args: { where: { accessCode: "EV-123456" } } },
    { method: "session.findFirst", args: { where: { id: "session-1" } } },
    { method: "session.findFirst", args: assignmentLookupArgs() },
    { method: "response.findFirst", args: { where: { sessionId: "session-1", questionId: "question-1" }, orderBy: { createdAt: "desc" } } },
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
  ]);
});

test("candidate invite access cannot save after session completion", async () => {
  const service = new ResponsesService({
    interviewSession: {
      findFirst: async () => ({ ...accessSessionRow, status: "COMPLETED" }),
    },
    response: {},
  } as any);

  await assert.rejects(
    () => service.saveResponseByAccessCode("EV-123456", { questionId: "question-1", responseText: "Late answer" }),
    (err: any) => {
      // Must be a clean 403 with a standalone message — not the garbled
      // "Session no longer available not found or access denied." template.
      assert.equal(err.getStatus(), 403);
      assert.match(err.message, /no longer available/i);
      assert.doesNotMatch(err.message, /not found or access denied/i);
      return true;
    },
  );
});

test("saveResponse upserts on (session, question) so a resubmit updates instead of duplicating", async () => {
  const calls: Array<{ method: string; args?: any }> = [];
  const service = new ResponsesService({
    interviewSession: { findFirst: async () => assignedSessionRow() },
    response: {
      upsert: async (args: any) => {
        calls.push({ method: "upsert", args });
        return { id: "response-1", sessionId: "session-1", questionId: "question-1", responseText: args.create.responseText, responseJson: null };
      },
      create: async () => {
        calls.push({ method: "create" });
        throw new Error("create must not be called when upsert is available");
      },
    },
  } as never);

  await service.saveResponse({ sessionId: "session-1", questionId: "question-1", responseText: "first" });
  await service.saveResponse({ sessionId: "session-1", questionId: "question-1", responseText: "edited" });

  const upserts = calls.filter((call) => call.method === "upsert");
  assert.equal(upserts.length, 2, "each save routes through the atomic upsert");
  assert.deepEqual(upserts[0].args.where, { sessionId_questionId: { sessionId: "session-1", questionId: "question-1" } });
  assert.ok(!calls.some((call) => call.method === "create"), "no duplicate insert");
});

test("saveResponse reconciles a concurrent insert race (P2002) by updating the existing row", async () => {
  const calls: string[] = [];
  const service = new ResponsesService({
    interviewSession: { findFirst: async () => assignedSessionRow() },
    response: {
      upsert: async () => {
        calls.push("upsert");
        const error = new Error("duplicate key") as Error & { code?: string };
        error.code = "P2002";
        throw error;
      },
      findFirst: async () => ({ id: "existing-1", sessionId: "session-1", questionId: "question-1", responseText: "raced-in", responseJson: null }),
      update: async (args: any) => {
        calls.push("update");
        return { id: args.where.id, sessionId: "session-1", questionId: "question-1", responseText: args.data.responseText, responseJson: null };
      },
    },
  } as never);

  const result = await service.saveResponse({ sessionId: "session-1", questionId: "question-1", responseText: "raced" });
  assert.deepEqual(calls, ["upsert", "update"], "P2002 → update the row the race winner inserted");
  assert.equal(result.responseText, "raced");
});

function assignedSessionRow() {
  return {
    ...accessSessionRow,
    template: { modules: [{ id: "module-1", moduleType: "AI_INTERVIEW", questions: [{ id: "question-1" }] }] },
  };
}

function assignmentLookupArgs() {
  return {
    where: { id: "session-1" },
    select: { accessCode: true, template: { select: { modules: { select: { id: true, moduleType: true, questions: { select: { id: true } } } } } } },
  };
}
