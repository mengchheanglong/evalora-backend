import { test } from "node:test";
import { strict as assert } from "node:assert";
import { evaluateResponse, generateCandidateReport, getModuleEvaluationProfile } from "../src/modules/ai/evaluation.service";

test("evaluateResponse returns bounded rubric output with evidence and advisory notice", () => {
  const result = evaluateResponse({
    moduleType: "leadership",
    moduleTitle: "Leadership Scenario",
    responseText:
      "I would listen to both teammates, clarify the deadline risk, propose a smaller release, and explain the trade-off to the client with follow-up actions.",
    rubric: ["clarity", "empathy", "decision-making", "professionalism", "problem-solving"],
  });

  assert.ok(result.score >= 1 && result.score <= 5);
  assert.equal(result.moduleType, "leadership");
  assert.equal(result.moduleTitle, "Leadership Scenario");
  assert.ok(result.feedback.includes("Leadership Scenario"));
  assert.ok(result.evidence.length > 0);
  assert.ok(result.strengths.length > 0);
  assert.match(result.advisoryNotice, /advisory/i);
  assert.doesNotMatch(result.advisoryNotice, /hire|reject|diagnosis/i);
});

test("evaluateResponse gives no score or fabricated strengths for an empty/trivial answer", () => {
  const empty = evaluateResponse({
    moduleType: "behavioral",
    moduleTitle: "Behavioral",
    responseText: "",
    rubric: ["clarity", "ownership"],
  });
  assert.equal(empty.score, 0, "empty answer must score 0, not a floor of 1 (20%)");
  assert.deepEqual(empty.strengths, [], "empty answer must not invent strengths");
  assert.match(empty.feedback, /no assessable response/i);

  const trivial = evaluateResponse({
    moduleType: "behavioral",
    moduleTitle: "Behavioral",
    responseText: "idk",
    rubric: ["clarity", "ownership"],
  });
  assert.ok(trivial.score < 1, `a one-word answer should score below 1/5, got ${trivial.score}`);
  assert.deepEqual(trivial.strengths, []);

  const wrong = evaluateResponse({
    moduleType: "behavioral",
    moduleTitle: "Behavioral",
    responseText: "Purple tables drift beside winter windows while seven unrelated sentences repeat without answering the assessment question.",
    rubric: ["clarity", "ownership"],
  });
  assert.equal(wrong.score, 0, "an unrelated answer must not earn length or attempt credit");
  assert.deepEqual(wrong.strengths, []);

  const failedObjectiveWork = evaluateResponse({
    moduleType: "coding",
    moduleTitle: "Coding Assessment",
    responseText: "I explain the approach, test edge cases, debug failures, and measure the result.",
    objectiveScore: 0,
  });
  assert.equal(failedObjectiveWork.score, 0);
  assert.deepEqual(failedObjectiveWork.strengths, [], "a failed objective assessment must not infer strengths from keywords");
});

test("evaluateResponse uses exact 0, 25, 50, 80, and 100 percent score anchors", () => {
  const rubric = ["clarity", "testing", "impact", "reflection"];
  const cases = [
    { expected: 0, responseText: "" },
    { expected: 1.25, responseText: "I explain the request clearly to the team before starting work." },
    { expected: 2.5, responseText: "I clarify the request with the team, test one example, and explain the result." },
    { expected: 4, responseText: "I clarify the request with the team, explain the trade-off, test the change, measure impact, and share the result because the customer needs a reliable outcome." },
    { expected: 5, responseText: "I provide clarity by explaining the trade-off to the team. I test several examples and edge cases, measure impact with a percent metric, and reflect on the result because the customer outcome matters. I clarify assumptions, listen to feedback, document evidence, explain the deadline risk, and validate the final result with another test. The measurable outcome and reflection guide the next iteration, and the team uses that evidence to improve the customer impact." },
  ];

  for (const item of cases) {
    const result = evaluateResponse({ moduleType: "problem_solving", responseText: item.responseText, rubric });
    assert.equal(result.score, item.expected);
    assert.equal(Math.round(result.score * 20), item.expected * 20);
  }
});

test("evaluateResponse scores candidate answers rather than question text", () => {
  const result = evaluateResponse({
    moduleType: "problem_solving",
    questionContext: ["Question: Explain your testing, impact measurement, and trade-off reasoning."],
    responseText: "unrelated purple winter window words provide no valid response here",
    rubric: ["testing", "impact measurement", "trade-off reasoning"],
  });

  assert.equal(result.score, 0);
});

test("a rubric criterion is not satisfied by one incidental keyword", () => {
  const rubric = ["technical reasoning", "incident process", "prevention change"];
  const namesTheWords = evaluateResponse({
    moduleType: "ai_interview",
    responseText: "The incident was technical and the process changed, and I care about the team.",
    rubric,
  });
  const showsTheBehaviour = evaluateResponse({
    moduleType: "ai_interview",
    responseText:
      "The technical reasoning was that a dropped index made one query 2000 times slower. Our incident process is to roll back first, then investigate, so I reverted the deploy and explained the customer impact to the team. The prevention change was a slow-query alert.",
    rubric,
  });

  assert.ok(
    showsTheBehaviour.score > namesTheWords.score,
    `an answer demonstrating the criteria (${showsTheBehaviour.score}) must outscore one only naming them (${namesTheWords.score})`,
  );
});

test("rubric terms match whole words, not fragments inside other words", () => {
  const fragmentOnly = evaluateResponse({
    moduleType: "coding",
    responseText: "I shipped the latest release to the contest environment without further review.",
    rubric: ["test"],
  });
  const realTerm = evaluateResponse({
    moduleType: "coding",
    responseText: "I tested the latest release in the contest environment before shipping it.",
    rubric: ["test"],
  });

  assert.ok(fragmentOnly.score < realTerm.score, "\"latest\" and \"contest\" must not evidence a \"test\" criterion");
});

test("questionContext never changes the score, the criteria, or the evidence quotes", () => {
  const candidateAnswer = "I rolled back the deployment and explained the failure to the team.";
  const rubric = ["ownership"];
  const plain = evaluateResponse({ moduleType: "behavioral", responseText: candidateAnswer, rubric });
  const withLeadingQuestion = evaluateResponse({
    moduleType: "behavioral",
    responseText: candidateAnswer,
    questionContext: [
      "Interviewer follow-up by Dana: Would you say you took full ownership, measured the impact with a percent metric, tested the result, and explained the trade-off to the client because the customer outcome mattered?",
    ],
    rubric,
  });

  assert.equal(withLeadingQuestion.score, plain.score);
  assert.deepEqual(withLeadingQuestion.criteriaScores, plain.criteriaScores);
  assert.deepEqual(withLeadingQuestion.evidence, plain.evidence);
  assert.deepEqual(withLeadingQuestion.strengths, plain.strengths);
  assert.deepEqual(withLeadingQuestion.improvementAreas, plain.improvementAreas);
});

test("generateCandidateReport reports no assessable work when nothing scored", () => {
  const report = generateCandidateReport({
    sessionId: "s-empty",
    candidateName: "No Show",
    assessmentName: "SE Assessment",
    evaluations: [
      evaluateResponse({ moduleType: "behavioral", moduleTitle: "Behavioral", responseText: "", rubric: ["clarity"] }),
    ],
  });
  assert.equal(report.overallScore, 0);
  assert.deepEqual(report.strengths, []);
  assert.match(report.summary, /did not provide enough assessable responses/i);
});

test("generateCandidateReport discards stray strengths from zero-score evaluations", () => {
  const report = generateCandidateReport({
    sessionId: "s-zero",
    candidateName: "No Evidence",
    assessmentName: "Coding Assessment",
    evaluations: [
      {
        moduleId: "coding",
        moduleTitle: "Coding Assessment",
        moduleType: "coding",
        weight: 1,
        score: 0,
        criteriaScores: { correctness: 0 },
        feedback: "No assessable response.",
        strengths: ["Uses practical evidence and problem-solving steps"],
        improvementAreas: ["Submit a working solution"],
        evidence: ["No passing tests"],
        advisoryNotice: "AI feedback is advisory.",
      },
    ],
  });

  assert.deepEqual(report.strengths, []);
  assert.match(report.summary, /no strengths or scores were inferred/i);
});

test("generateCandidateReport computes weighted overall score and aggregates evidence", () => {
  const report = generateCandidateReport({
    sessionId: "session-1",
    candidateName: "Demo Candidate",
    assessmentName: "Software Engineer Assessment",
    completedAt: "2026-07-01T09:00:00.000Z",
    evaluations: [
      {
        moduleId: "ai",
        moduleTitle: "AI Interview",
        moduleType: "ai_interview",
        weight: 1,
        score: 4,
        criteriaScores: { clarity: 4 },
        feedback: "Clear technical reasoning.",
        strengths: ["Clear reasoning"],
        improvementAreas: ["Add metrics"],
        evidence: ["Explained trade-offs"],
        advisoryNotice: "AI feedback is advisory and must be reviewed by a human interviewer.",
      },
      {
        moduleId: "code",
        moduleTitle: "Coding Assessment",
        moduleType: "coding",
        weight: 2,
        score: 5,
        criteriaScores: { correctness: 5 },
        feedback: "Strong coding solution.",
        strengths: ["Readable code"],
        improvementAreas: ["Mention complexity"],
        evidence: ["Handled edge cases"],
        advisoryNotice: "AI feedback is advisory and must be reviewed by a human interviewer.",
      },
    ],
    reviewerNotes: ["Good candidate for human review."],
  });

  assert.equal(report.sessionId, "session-1");
  assert.equal(report.overallScore, 4.67);
  assert.deepEqual(report.moduleScores, {
    "AI Interview": 4,
    "Coding Assessment": 5,
  });
  assert.ok(report.summary.includes("Demo Candidate"));
  assert.ok(report.evidence.includes("Handled edge cases"));
  assert.ok(report.reviewerSummary?.includes("Good candidate"));
  assert.match(report.advisoryNotice, /not a final hiring decision/i);
});

test("getModuleEvaluationProfile returns module-specific rubrics and safe guidance", () => {
  const leadership = getModuleEvaluationProfile("leadership");
  const behavioral = getModuleEvaluationProfile("behavioral");
  const problemSolving = getModuleEvaluationProfile("problem_solving");
  const communication = getModuleEvaluationProfile("communication");
  const coding = getModuleEvaluationProfile("coding");

  assert.ok(leadership.rubric.includes("conflict resolution"));
  assert.ok(behavioral.rubric.includes("self-awareness"));
  assert.ok(problemSolving.rubric.includes("root-cause analysis"));
  assert.ok(communication.rubric.includes("active listening"));
  assert.ok(coding.rubric.includes("execution result"));
  assert.match(behavioral.safetyGuidance.join(" "), /no medical or mental-health diagnosis/i);
  assert.match(leadership.safetyGuidance.join(" "), /no final hiring decision/i);
});
