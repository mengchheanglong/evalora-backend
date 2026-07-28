import { test } from "node:test";
import { strict as assert } from "node:assert";
import { DEFAULT_LIST_LIMIT } from "../src/common/query.constants";
import type { AccessContext } from "../src/modules/auth/access-control";
import { TranscriptService } from "../src/modules/transcript/transcript.service";
import type { TranscriptEntry, TranscriptSessionRow } from "../src/modules/transcript/transcript.types";

const interviewerAccess: AccessContext = { userId: "interviewer-1", role: "interviewer", organizationId: "org-1" };
const otherOrgAccess: AccessContext = { userId: "outsider-1", role: "organization", organizationId: "org-2" };

const at = (minutes: number) => new Date(Date.UTC(2026, 6, 28, 9, minutes, 0));

const sessionRow: TranscriptSessionRow = {
  id: "session-1",
  candidateId: "candidate-1",
  status: "COMPLETED",
  startedAt: at(0),
  completedAt: at(50),
  candidate: { id: "candidate-1", name: "Demo Candidate", email: "candidate@example.com" },
  template: {
    title: "Backend Engineer Assessment",
    modules: [
      {
        id: "module-ai",
        title: "AI Interview",
        moduleType: "AI_INTERVIEW",
        orderIndex: 0,
        questions: [{ id: "question-1", questionText: "Describe a system you scaled." }],
      },
      {
        id: "module-coding",
        title: "Coding Assessment",
        moduleType: "CODING",
        orderIndex: 1,
        questions: [{ id: "question-2", questionText: "Reverse a linked list." }],
      },
    ],
  },
  responses: [
    {
      id: "response-1",
      responseText: "I sharded the write path and added a read replica.",
      createdAt: at(5),
      question: {
        id: "question-1",
        questionText: "Describe a system you scaled.",
        module: { id: "module-ai", title: "AI Interview", moduleType: "AI_INTERVIEW" },
      },
    },
    {
      id: "response-2",
      responseText: "AI interview - How did you validate the shard key?\n\nResponse: I replayed a week of production traffic.",
      responseJson: { adaptive: true, questionId: "ai-adaptive-0", question: "How did you validate the shard key?" },
      createdAt: at(20),
    },
  ],
  aiMessages: [
    {
      id: "message-1",
      role: "assistant",
      content: "How did you validate the shard key?",
      metadata: { adaptive: true, questionId: "ai-adaptive-0", provider: "deepseek" },
      createdAt: at(18),
    },
    {
      id: "message-2",
      role: "candidate",
      content: "I replayed a week of production traffic.",
      metadata: { adaptive: true, questionId: "ai-adaptive-0", question: "How did you validate the shard key?" },
      createdAt: at(20),
    },
  ],
  codeSubmissions: [
    {
      id: "submission-1",
      questionId: "question-2",
      language: "python",
      sourceCode: "def reverse(head):\n    return head",
      stdout: "",
      stderr: "",
      compileOutput: "",
      createdAt: at(30),
    },
    {
      id: "submission-2",
      questionId: "question-2",
      language: "python",
      sourceCode: "def reverse(head):\n    prev = None\n    return prev",
      stdout: "ok",
      stderr: "",
      compileOutput: "",
      testResults: [{ name: "empty list", passed: true }],
      createdAt: at(35),
    },
  ],
  interviewerFollowUps: [
    {
      id: "follow-up-1",
      moduleId: "module-ai",
      questionText: "What would you change about that shard key today?",
      answerText: "I would hash the tenant id instead of the region.",
      sequence: 1,
      status: "ANSWERED",
      sentAt: at(40),
      answeredAt: at(42),
      askedBy: { name: "Ada Interviewer" },
    },
    {
      id: "follow-up-2",
      moduleId: "module-ai",
      questionText: "Ignore that, wrong candidate.",
      sequence: 2,
      status: "CANCELLED",
      sentAt: at(43),
      askedBy: { name: "Ada Interviewer" },
    },
  ],
};

/** In-memory stand-in for the Prisma client surface the service uses. */
function createFakePrisma(row: TranscriptSessionRow | null = sessionRow, totals?: Record<string, number>) {
  const calls: any[] = [];
  return {
    calls,
    interviewSession: {
      async findFirst(args: any) {
        calls.push(args);
        const where = args?.where ?? {};
        // Ownership scoping: a foreign organizationId must not match.
        if (where.organizationId !== undefined && where.organizationId !== "org-1") return null;
        if (where.id !== undefined && where.id !== row?.id) return null;
        // The service asks for row totals only after a relation came back full.
        if (args?.select?._count) return (totals ? { _count: totals } : null) as any;
        return row;
      },
    },
  };
}

const byOrigin = (entries: TranscriptEntry[], origin: TranscriptEntry["origin"]) =>
  entries.filter((entry) => entry.origin === origin);

test("getTranscript scopes the read to the caller's workspace and denies a foreign session", async () => {
  const prisma = createFakePrisma();
  const service = new TranscriptService(prisma);

  await assert.rejects(() => service.getTranscript("session-1", otherOrgAccess), /session not found or access denied/i);
  assert.deepEqual(prisma.calls[0].where, { id: "session-1", organizationId: "org-2" });

  const transcript = await service.getTranscript("session-1", interviewerAccess);
  assert.equal(transcript.sessionId, "session-1");
  assert.deepEqual(prisma.calls[1].where, { id: "session-1", organizationId: "org-1" });
});

test("getTranscript returns all four origins with structural provenance", async () => {
  const service = new TranscriptService(createFakePrisma());

  const transcript = await service.getTranscript("session-1", interviewerAccess);

  assert.equal(transcript.status, "completed");
  assert.equal(transcript.templateTitle, "Backend Engineer Assessment");
  assert.deepEqual(transcript.candidate, { id: "candidate-1", name: "Demo Candidate", email: "candidate@example.com" });
  assert.deepEqual(transcript.counts, { template: 1, aiAdaptive: 1, interviewerFollowUp: 2, codeSubmission: 2 });

  // Sequence is a stable 1-based ordinal over the flat, chronological list.
  assert.deepEqual(transcript.entries.map((entry) => entry.sequence), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(transcript.entries.map((entry) => entry.origin), [
    "template",
    "ai_adaptive",
    "code_submission",
    "code_submission",
    "interviewer_follow_up",
    "interviewer_follow_up",
  ]);

  const [templateEntry] = byOrigin(transcript.entries, "template");
  assert.equal(templateEntry.questionText, "Describe a system you scaled.");
  assert.equal(templateEntry.answerText, "I sharded the write path and added a read replica.");
  assert.equal(templateEntry.moduleTitle, "AI Interview");
  assert.equal(templateEntry.moduleType, "ai_interview");
  assert.equal(templateEntry.isEvidence, true);

  const [adaptiveEntry] = byOrigin(transcript.entries, "ai_adaptive");
  assert.equal(adaptiveEntry.questionText, "How did you validate the shard key?");
  assert.equal(adaptiveEntry.answerText, "I replayed a week of production traffic.");
  assert.equal(adaptiveEntry.askedAt, at(18).toISOString());
  assert.equal(adaptiveEntry.isEvidence, true);

  const codeEntries = byOrigin(transcript.entries, "code_submission");
  assert.equal(codeEntries[0].questionText, "Reverse a linked list.");
  assert.equal(codeEntries[0].code?.language, "python");
  // Only the latest submission per question reaches the scorer.
  assert.equal(codeEntries[0].isEvidence, false);
  assert.equal(codeEntries[1].isEvidence, true);
  assert.deepEqual(codeEntries[1].code?.testResults, [{ name: "empty list", passed: true }]);

  const [answeredFollowUp] = byOrigin(transcript.entries, "interviewer_follow_up");
  assert.deepEqual(answeredFollowUp.askedBy, { name: "Ada Interviewer" });
  assert.equal(answeredFollowUp.status, "answered");
  assert.equal(answeredFollowUp.questionText, "What would you change about that shard key today?");
  assert.equal(answeredFollowUp.answerText, "I would hash the tenant id instead of the region.");
  assert.equal(answeredFollowUp.isEvidence, true);
});

test("getTranscript keeps cancelled and unanswered follow-ups out of the evidence set", async () => {
  const service = new TranscriptService(
    createFakePrisma({
      ...sessionRow,
      interviewerFollowUps: [
        ...(sessionRow.interviewerFollowUps ?? []),
        {
          id: "follow-up-3",
          moduleId: "module-ai",
          questionText: "Still waiting on this one.",
          sequence: 3,
          status: "SENT",
          sentAt: at(44),
          askedBy: { name: "Ada Interviewer" },
        },
      ],
    }),
  );

  const transcript = await service.getTranscript("session-1", interviewerAccess);
  const followUps = byOrigin(transcript.entries, "interviewer_follow_up");

  assert.deepEqual(
    followUps.map((entry) => [entry.status, entry.isEvidence]),
    [
      ["answered", true],
      ["cancelled", false],
      ["sent", false],
    ],
  );
  // A withdrawn question stays visible: the reviewer sees it was asked, not scored.
  assert.equal(followUps[1].questionText, "Ignore that, wrong candidate.");
  assert.equal(followUps[1].answerText, undefined);
});

test("getTranscript returns a session that has no code submissions", async () => {
  const service = new TranscriptService(
    createFakePrisma({ ...sessionRow, codeSubmissions: [], interviewerFollowUps: [] }),
  );

  const transcript = await service.getTranscript("session-1", interviewerAccess);

  assert.deepEqual(transcript.counts, { template: 1, aiAdaptive: 1, interviewerFollowUp: 0, codeSubmission: 0 });
  assert.equal(transcript.entries.every((entry) => entry.code === undefined), true);
});

test("getTranscript reports an unanswered AI probe as context rather than evidence", async () => {
  const service = new TranscriptService(
    createFakePrisma({
      ...sessionRow,
      responses: (sessionRow.responses ?? []).filter((response) => response.id === "response-1"),
      aiMessages: [
        {
          id: "message-1",
          role: "assistant",
          content: "How did you validate the shard key?",
          metadata: { adaptive: true, questionId: "ai-adaptive-0" },
          createdAt: at(18),
        },
      ],
    }),
  );

  const transcript = await service.getTranscript("session-1", interviewerAccess);
  const [adaptiveEntry] = byOrigin(transcript.entries, "ai_adaptive");

  assert.equal(adaptiveEntry.questionText, "How did you validate the shard key?");
  assert.equal(adaptiveEntry.answerText, undefined);
  assert.equal(adaptiveEntry.isEvidence, false);
});

const CANDIDATE_ANSWER = "I sharded the write path and added a read replica.";
const AI_FOLLOW_UP = "Which failure mode worried you most about that shard key?";
const FOLLOW_UP_ANSWER = "A hot tenant landing on a single shard.";

/**
 * A mid-module AI follow-up, in exactly the shapes that are persisted: the pair of
 * AI messages written by candidate-ai.service, and the single response column the
 * candidate app writes the answer and the follow-up into.
 */
const aiFollowUpRow: TranscriptSessionRow = {
  ...sessionRow,
  responses: [
    {
      id: "response-1",
      responseText: `${CANDIDATE_ANSWER}\n\nAI follow-up: ${AI_FOLLOW_UP}\nFollow-up response: ${FOLLOW_UP_ANSWER}`,
      createdAt: at(5),
      question: {
        id: "question-1",
        questionText: "Describe a system you scaled.",
        module: { id: "module-ai", title: "AI Interview", moduleType: "AI_INTERVIEW" },
      },
    },
  ],
  aiMessages: [
    {
      id: "message-1",
      role: "candidate",
      content: CANDIDATE_ANSWER,
      metadata: { question: "Describe a system you scaled." },
      createdAt: at(4),
    },
    {
      id: "message-2",
      role: "assistant",
      content: AI_FOLLOW_UP,
      metadata: { provider: "deepseek", basedOn: "candidate_answer", streamed: true },
      createdAt: at(4),
    },
  ],
  codeSubmissions: [],
  interviewerFollowUps: [],
};

test("getTranscript pairs an AI follow-up with the answer it actually received", async () => {
  const service = new TranscriptService(createFakePrisma(aiFollowUpRow));

  const transcript = await service.getTranscript("session-1", interviewerAccess);
  const adaptiveEntries = byOrigin(transcript.entries, "ai_adaptive");

  // One line per AI question: the candidate's answer to the TEMPLATE question is
  // not a second, AI-attributed copy of that question.
  assert.deepEqual(transcript.counts, { template: 1, aiAdaptive: 1, interviewerFollowUp: 0, codeSubmission: 0 });
  assert.equal(adaptiveEntries.length, 1);
  assert.equal(
    transcript.entries.some((entry) => entry.origin === "ai_adaptive" && entry.questionText === "Describe a system you scaled."),
    false,
  );

  const [adaptiveEntry] = adaptiveEntries;
  assert.equal(adaptiveEntry.questionText, AI_FOLLOW_UP);
  assert.equal(adaptiveEntry.answerText, FOLLOW_UP_ANSWER);
  assert.equal(adaptiveEntry.askedAt, at(4).toISOString());
  assert.equal(adaptiveEntry.answeredAt, at(5).toISOString());
  assert.equal(adaptiveEntry.moduleTitle, "AI Interview");
  // The parent response is scored whole, so the follow-up answer did count.
  assert.equal(adaptiveEntry.isEvidence, true);
});

test("getTranscript keeps an AI-authored follow-up out of the candidate's own answer", async () => {
  const service = new TranscriptService(createFakePrisma(aiFollowUpRow));

  const transcript = await service.getTranscript("session-1", interviewerAccess);
  const [templateEntry] = byOrigin(transcript.entries, "template");

  assert.equal(templateEntry.answerText, CANDIDATE_ANSWER);
  assert.equal(templateEntry.answerText?.includes("AI follow-up"), false);
  // The answer stays above its follow-up, so the exchange still reads in order.
  assert.deepEqual(transcript.entries.map((entry) => entry.origin), ["template", "ai_adaptive"]);
});

test("getTranscript leaves an ambiguous follow-up marker inside the candidate's answer", async () => {
  const ambiguous = [
    // The candidate quoted the marker themselves: two blocks cannot be told apart.
    `${CANDIDATE_ANSWER}\n\nAI follow-up: something I typed myself\n\nAI follow-up: ${AI_FOLLOW_UP}\nFollow-up response: ${FOLLOW_UP_ANSWER}`,
    // Half a marker pair: splitting here would drop the trailing text.
    `${CANDIDATE_ANSWER}\n\nAI follow-up: ${AI_FOLLOW_UP}`,
    // An empty side of the pair is not the shape the app writes.
    `${CANDIDATE_ANSWER}\n\nAI follow-up: \nFollow-up response: ${FOLLOW_UP_ANSWER}`,
  ];

  for (const responseText of ambiguous) {
    const service = new TranscriptService(
      createFakePrisma({
        ...aiFollowUpRow,
        responses: [{ ...(aiFollowUpRow.responses ?? [])[0], responseText }],
        aiMessages: [],
      }),
    );

    const transcript = await service.getTranscript("session-1", interviewerAccess);
    const [templateEntry] = byOrigin(transcript.entries, "template");

    assert.equal(templateEntry.answerText, responseText);
    assert.deepEqual(byOrigin(transcript.entries, "ai_adaptive"), []);
  }
});

test("getTranscript shows one entry per adaptive question, not one per save", async () => {
  // Saving an adaptive answer appends a row instead of updating, so real sessions
  // hold several rows for one question. A reviewer must see the answer the
  // candidate settled on, once — not every intermediate save of it.
  const service = new TranscriptService(
    createFakePrisma({
      ...sessionRow,
      responses: [],
      aiMessages: [
        { id: "m-ask", role: "assistant", content: "Why that trade-off?", metadata: null, createdAt: at(10) },
        { id: "m-a1", role: "candidate", content: "I do not know", metadata: { question: "Why that trade-off?" }, createdAt: at(11) },
        { id: "m-a2", role: "candidate", content: "I do not know", metadata: { question: "Why that trade-off?" }, createdAt: at(12) },
        { id: "m-a3", role: "candidate", content: "Latency mattered more than cost.", metadata: { question: "Why that trade-off?" }, createdAt: at(13) },
      ],
      codeSubmissions: [],
      interviewerFollowUps: [],
    }),
  );

  const transcript = await service.getTranscript("session-1", interviewerAccess);
  const adaptive = byOrigin(transcript.entries, "ai_adaptive");

  assert.equal(adaptive.length, 1);
  assert.equal(adaptive[0].questionText, "Why that trade-off?");
  // The last save wins: it is what the candidate left behind.
  assert.equal(adaptive[0].answerText, "Latency mattered more than cost.");
});

test("getTranscript separates a follow-up the candidate has not answered yet", async () => {
  // The app writes the marker block the moment the question appears, so the most
  // common shape on an in-progress session has an empty answer. Leaving it merged
  // would show an AI-authored question as the candidate's own words.
  const service = new TranscriptService(
    createFakePrisma({
      ...aiFollowUpRow,
      responses: [{
        ...(aiFollowUpRow.responses ?? [])[0],
        responseText: `${CANDIDATE_ANSWER}\n\nAI follow-up: ${AI_FOLLOW_UP}\nFollow-up response: `,
      }],
      aiMessages: [],
    }),
  );

  const transcript = await service.getTranscript("session-1", interviewerAccess);
  const [templateEntry] = byOrigin(transcript.entries, "template");
  const [followUpEntry] = byOrigin(transcript.entries, "ai_adaptive");

  assert.equal(templateEntry.answerText, CANDIDATE_ANSWER);
  assert.equal(followUpEntry.questionText, AI_FOLLOW_UP);
  assert.equal(followUpEntry.answerText, undefined);
  // Nothing was answered, so nothing may be presented as scored evidence.
  assert.equal(followUpEntry.isEvidence, false);
});

test("getTranscript does not claim an interviewer follow-up on a removed module was scored", async () => {
  const service = new TranscriptService(
    createFakePrisma({
      ...sessionRow,
      interviewerFollowUps: [
        {
          id: "follow-up-removed",
          moduleId: "module-deleted",
          questionText: "How did you monitor that rollout?",
          answerText: "Dashboards plus an error-budget alert.",
          sequence: 1,
          status: "ANSWERED",
          sentAt: at(40),
          answeredAt: at(42),
          askedBy: { name: "Ada Interviewer" },
        },
        {
          id: "follow-up-parent",
          parentQuestionId: "question-1",
          questionText: "What did the read replica cost you?",
          answerText: "About twelve percent more spend.",
          sequence: 2,
          status: "ANSWERED",
          sentAt: at(43),
          answeredAt: at(44),
          askedBy: { name: "Ada Interviewer" },
        },
      ],
    }),
  );

  const transcript = await service.getTranscript("session-1", interviewerAccess);
  const followUps = byOrigin(transcript.entries, "interviewer_follow_up");

  // The report drops a follow-up whose module no longer exists, so the transcript
  // must not present it as scored evidence - but it stays visible as context.
  assert.equal(followUps[0].questionText, "How did you monitor that rollout?");
  assert.equal(followUps[0].isEvidence, false);
  assert.equal(followUps[0].moduleTitle, undefined);
  // A parent question still resolves through the answer the candidate saved.
  assert.equal(followUps[1].moduleId, "module-ai");
  assert.equal(followUps[1].isEvidence, true);
});

const LIVE_QUESTION = "Describe a system you scaled.";
const ASKED_QUESTION = "Describe a system you scaled, and what broke first.";

/** The template answer alone, with whatever the responses service left on its JSON. */
function rowWithResponseJson(responseJson: unknown): TranscriptSessionRow {
  return {
    ...sessionRow,
    responses: [{ ...(sessionRow.responses ?? [])[0], responseJson }],
    aiMessages: [],
    codeSubmissions: [],
    interviewerFollowUps: [],
  };
}

test("getTranscript shows the question as it was asked, not as the template reads today", async () => {
  const service = new TranscriptService(
    createFakePrisma(
      rowWithResponseJson({
        questionSnapshot: { questionText: ASKED_QUESTION, rubric: ["depth"], capturedAt: at(5).toISOString() },
      }),
    ),
  );

  const transcript = await service.getTranscript("session-1", interviewerAccess);
  const [templateEntry] = byOrigin(transcript.entries, "template");

  assert.equal(templateEntry.questionText, ASKED_QUESTION);
  assert.equal(templateEntry.questionTextIsSnapshot, true);
  // The rewrite is surfaced, not hidden: the reviewer judges the answer against
  // the question the candidate actually saw and can see it has since changed.
  assert.equal(templateEntry.liveQuestionText, LIVE_QUESTION);
  assert.equal(templateEntry.answerText, "I sharded the write path and added a read replica.");
});

test("getTranscript does not claim an edit when the template still reads as it was asked", async () => {
  const service = new TranscriptService(
    createFakePrisma(
      rowWithResponseJson({ questionSnapshot: { questionText: LIVE_QUESTION, rubric: [], capturedAt: at(5).toISOString() } }),
    ),
  );

  const transcript = await service.getTranscript("session-1", interviewerAccess);
  const [templateEntry] = byOrigin(transcript.entries, "template");

  assert.equal(templateEntry.questionText, LIVE_QUESTION);
  assert.equal(templateEntry.questionTextIsSnapshot, true);
  assert.equal(templateEntry.liveQuestionText, undefined);
});

test("getTranscript falls back to the live question when the answer carries no usable snapshot", async () => {
  // Every shape the column really holds without a snapshot: an answer saved
  // before snapshots existed, a structured payload, a snapshot the lookup could
  // not fill in, and a non-object payload with nowhere to put one.
  const withoutSnapshot = [undefined, null, { adaptive: false }, { questionSnapshot: { questionText: "", rubric: [] } }, "plain text"];

  for (const responseJson of withoutSnapshot) {
    const service = new TranscriptService(createFakePrisma(rowWithResponseJson(responseJson)));

    const transcript = await service.getTranscript("session-1", interviewerAccess);
    const [templateEntry] = byOrigin(transcript.entries, "template");

    assert.equal(templateEntry.questionText, LIVE_QUESTION);
    assert.equal(templateEntry.questionTextIsSnapshot, false);
    assert.equal(templateEntry.liveQuestionText, undefined);
    assert.equal(templateEntry.isEvidence, true);
  }
});

test("getTranscript leaves a legacy session, written before snapshots, reading exactly as before", async () => {
  const service = new TranscriptService(createFakePrisma());

  const transcript = await service.getTranscript("session-1", interviewerAccess);

  assert.deepEqual(transcript.counts, { template: 1, aiAdaptive: 1, interviewerFollowUp: 2, codeSubmission: 2 });
  const [templateEntry] = byOrigin(transcript.entries, "template");
  assert.equal(templateEntry.questionText, LIVE_QUESTION);
  // No snapshot anywhere means no line may claim to be one, whatever its origin.
  assert.equal(transcript.entries.every((entry) => entry.questionTextIsSnapshot === false), true);
  assert.equal(transcript.entries.every((entry) => entry.liveQuestionText === undefined), true);
});

test("getTranscript does not replay an answer as an AI line when its question was reworded", async () => {
  // The chat message repeats the question as it was ASKED, so matching it against
  // the edited template row alone would leave the same answer showing twice.
  const service = new TranscriptService(
    createFakePrisma({
      ...rowWithResponseJson({
        questionSnapshot: { questionText: ASKED_QUESTION, rubric: [], capturedAt: at(5).toISOString() },
      }),
      aiMessages: [
        {
          id: "message-1",
          role: "candidate",
          content: "I sharded the write path and added a read replica.",
          metadata: { question: ASKED_QUESTION },
          createdAt: at(5),
        },
      ],
    }),
  );

  const transcript = await service.getTranscript("session-1", interviewerAccess);

  assert.deepEqual(transcript.counts, { template: 1, aiAdaptive: 0, interviewerFollowUp: 0, codeSubmission: 0 });
});

test("getTranscript reports a complete transcript as untruncated", async () => {
  const service = new TranscriptService(createFakePrisma());

  const transcript = await service.getTranscript("session-1", interviewerAccess);

  assert.deepEqual(transcript.truncation, {
    truncated: false,
    limit: DEFAULT_LIST_LIMIT,
    omitted: { responses: 0, aiMessages: 0, codeSubmissions: 0, interviewerFollowUps: 0 },
  });
});

test("getTranscript says so when a session holds more rows than one page", async () => {
  const cappedMessages = Array.from({ length: DEFAULT_LIST_LIMIT }, (_, index) => ({
    id: `message-${index}`,
    role: "assistant",
    content: `Probe number ${index}?`,
    metadata: { provider: "deepseek" },
    createdAt: at(10),
  }));
  const service = new TranscriptService(
    createFakePrisma({ ...sessionRow, aiMessages: cappedMessages }, {
      responses: 2,
      aiMessages: 640,
      codeSubmissions: 2,
      interviewerFollowUps: 2,
    }),
  );

  const transcript = await service.getTranscript("session-1", interviewerAccess);

  assert.deepEqual(transcript.truncation, {
    truncated: true,
    limit: DEFAULT_LIST_LIMIT,
    omitted: { responses: 0, aiMessages: 140, codeSubmissions: 0, interviewerFollowUps: 0 },
  });
});

test("getTranscript still flags truncation when the row totals cannot be read", async () => {
  const cappedFollowUps = Array.from({ length: DEFAULT_LIST_LIMIT }, (_, index) => ({
    id: `follow-up-${index}`,
    moduleId: "module-ai",
    questionText: `Question number ${index}?`,
    sequence: index,
    status: "SENT" as const,
    sentAt: at(40),
    askedBy: { name: "Ada Interviewer" },
  }));
  const service = new TranscriptService(createFakePrisma({ ...sessionRow, interviewerFollowUps: cappedFollowUps }));

  const transcript = await service.getTranscript("session-1", interviewerAccess);

  assert.equal(transcript.truncation.truncated, true);
  assert.equal(transcript.truncation.omitted.interviewerFollowUps, 0);
});
