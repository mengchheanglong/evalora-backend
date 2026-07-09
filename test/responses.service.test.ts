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
        assert.deepEqual(args, { where: { sessionId: "session-1" }, orderBy: { createdAt: "asc" } });
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
        return accessSessionRow;
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
    /no longer available/i,
  );
});
