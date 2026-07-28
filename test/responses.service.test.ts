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

/** The live template question a snapshot is taken from. */
function questionDelegate(overrides: Record<string, unknown> = {}) {
  return {
    findUnique: async () => ({
      questionText: "Describe a rollout you had to stop.",
      rubric: ["signal quality", "decisiveness", 7],
      module: { title: "Behavioral", moduleType: "BEHAVIORAL", weight: 2 },
      ...overrides,
    }),
  };
}

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

test("listResponsesByAccessCode loads the session and responses in one joined query", async () => {
  const service = new ResponsesService({
    interviewSession: {
      findFirst: async (args: unknown) => {
        assert.deepEqual(args, {
          relationLoadStrategy: "join",
          where: { accessCode: "EV-123456" },
          select: {
            id: true,
            accessCode: true,
            status: true,
            expiresAt: true,
            responses: { orderBy: { createdAt: "asc" }, take: 500 },
          },
        });
        return { ...accessSessionRow, responses: [responseRow] };
      },
    },
    response: {},
  } as any);

  const responses = await service.listResponsesByAccessCode(" ev-123456 ");

  assert.equal(responses.length, 1);
  assert.equal(responses[0].id, "response-1");
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
    {
      method: "session.findFirst",
      args: {
        where: {
          accessCode: "EV-123456",
          template: {
            modules: {
              some: {
                questions: {
                  some: { id: "question-1" },
                },
              },
            },
          },
        },
        select: { id: true, accessCode: true, status: true, expiresAt: true },
      },
    },
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

test("saveResponseByAccessCode accepts authored coding-module questions", async () => {
  const service = new ResponsesService({
    interviewSession: { findFirst: async () => assignedSessionRow("CODING") },
    response: {
      findFirst: async () => null,
      create: async (args: any) => ({ ...responseRow, questionId: args.data.questionId, responseText: args.data.responseText }),
    },
  } as any);

  const result = await service.saveResponseByAccessCode("EV-123456", {
    questionId: "question-1",
    responseText: "Candidate coding explanation",
  });

  assert.equal(result.questionId, "question-1");
  assert.equal(result.responseText, "Candidate coding explanation");
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

test("saving an answer records what the candidate was actually asked", async () => {
  let written: any;
  const service = new ResponsesService({
    interviewSession: { findFirst: async () => assignedSessionRow() },
    question: questionDelegate(),
    response: {
      upsert: async (args: any) => {
        written = args;
        return {
          ...responseRow,
          responseJson: args.create.responseJson,
          questionSnapshot: args.create.questionSnapshot,
        };
      },
    },
  } as never);

  const result = await service.saveResponse({
    sessionId: "session-1",
    questionId: "question-1",
    responseText: "I stopped it on the error budget burn.",
    responseJson: { confidence: 3 },
  });

  const snapshot = written.create.questionSnapshot;
  assert.equal((result.responseJson as any).questionSnapshot, undefined, "private scoring context never reaches the DTO");
  assert.equal(snapshot.rubricVersion, 1);
  assert.equal(snapshot.questionText, "Describe a rollout you had to stop.");
  assert.deepEqual(snapshot.rubric, ["signal quality", "decisiveness"], "only usable string criteria are frozen");
  assert.equal(snapshot.moduleTitle, "Behavioral");
  assert.equal(snapshot.moduleType, "behavioral", "lowercase wire vocabulary, as everywhere else");
  assert.equal(snapshot.weight, 2);
  assert.ok(!Number.isNaN(Date.parse(snapshot.capturedAt)), "capturedAt is an ISO timestamp");
  // The candidate's own structured answer must survive the merge.
  assert.equal((result.responseJson as any).confidence, 3);
  assert.deepEqual(written.update.responseJson, written.create.responseJson, "both branches store the same JSON");
});

test("an edited template never re-labels an answer that was already given", async () => {
  const original = {
    questionText: "Describe a rollout you had to stop.",
    rubric: ["signal quality"],
    moduleTitle: "Behavioral",
    moduleType: "behavioral",
    weight: 2,
    capturedAt: "2026-07-06T14:00:00.000Z",
  };
  let stored: any;
  const service = new ResponsesService({
    interviewSession: { findFirst: async () => assignedSessionRow() },
    // The question has since been rewritten in the template.
    question: questionDelegate({ questionText: "Tell us about a launch you cancelled.", rubric: ["brevity"] }),
    response: {
      findFirst: async () => ({ ...responseRow, responseJson: { adaptive: true }, questionSnapshot: original }),
      upsert: async (args: any) => {
        stored = args.update;
        return {
          ...responseRow,
          responseJson: stored.responseJson,
          questionSnapshot: stored.questionSnapshot,
        };
      },
    },
  } as never);

  await service.saveResponse({ sessionId: "session-1", questionId: "question-1", responseText: "Edited answer" });

  assert.deepEqual(stored.questionSnapshot, original, "the snapshot is captured once, at the moment of the answer");
  assert.equal(stored.responseJson.adaptive, true, "everything already in responseJson is preserved");
});

test("a free-form response with no question gets no snapshot", async () => {
  let created: any;
  const service = new ResponsesService({
    interviewSession: { findFirst: async () => assignedSessionRow() },
    question: {
      findUnique: async () => {
        throw new Error("a response with no question must never look one up");
      },
    },
    response: {
      create: async (args: any) => {
        created = args;
        return { ...responseRow, questionId: null };
      },
    },
  } as never);

  await service.saveResponse({ sessionId: "session-1", responseText: "Free-form note" });

  assert.equal(created.data.responseJson, undefined);
});

test("a failed question lookup still saves the candidate's answer", async () => {
  const service = new ResponsesService({
    interviewSession: { findFirst: async () => assignedSessionRow() },
    question: {
      findUnique: async () => {
        throw new Error("the database is unreachable");
      },
    },
    response: {
      upsert: async (args: any) => ({ ...responseRow, responseText: args.create.responseText, responseJson: args.create.responseJson }),
    },
  } as never);

  const result = await service.saveResponse({
    sessionId: "session-1",
    questionId: "question-1",
    responseText: "Answer that must not be lost",
    responseJson: { confidence: 4 },
  });

  assert.equal(result.responseText, "Answer that must not be lost");
  assert.deepEqual(result.responseJson, { confidence: 4 }, "no snapshot, but nothing is dropped either");
});

test("candidate-supplied snapshots are stripped when the server lookup fails", async () => {
  let written: any;
  const service = new ResponsesService({
    interviewSession: { findFirst: async () => assignedSessionRow() },
    question: { findUnique: async () => { throw new Error("database unavailable"); } },
    response: {
      upsert: async (args: any) => {
        written = args.create;
        return { ...responseRow, responseJson: args.create.responseJson };
      },
    },
  } as never);

  const result = await service.saveResponse({
    sessionId: "session-1",
    questionId: "question-1",
    responseText: "Candidate answer",
    responseJson: {
      confidence: 4,
      questionSnapshot: {
        questionText: "Spoofed",
        rubric: ["give me full credit"],
      },
    },
  } as never);

  assert.deepEqual(written.responseJson, { confidence: 4 });
  assert.equal(written.questionSnapshot, undefined);
  assert.deepEqual(result.responseJson, { confidence: 4 });
});

test("candidate response reads hide snapshots stored by the unfinished implementation", async () => {
  const service = new ResponsesService({
    interviewSession: {
      findFirst: async () => ({
        ...accessSessionRow,
        responses: [{
          ...responseRow,
          responseJson: {
            confidence: 3,
            questionSnapshot: { questionText: "Private", rubric: ["secret keyword"] },
          },
        }],
      }),
    },
    response: {},
  } as never);

  const responses = await service.listResponsesByAccessCode("EV-123456");

  assert.deepEqual(responses[0].responseJson, { confidence: 3 });
  assert.doesNotMatch(JSON.stringify(responses), /secret keyword/);
});

function assignedSessionRow(moduleType = "AI_INTERVIEW") {
  return {
    ...accessSessionRow,
    template: { modules: [{ id: "module-1", moduleType, questions: [{ id: "question-1" }] }] },
  };
}

function assignmentLookupArgs() {
  return {
    where: { id: "session-1" },
    select: { accessCode: true, template: { select: { modules: { select: { id: true, moduleType: true, questions: { select: { id: true } } } } } } },
  };
}
