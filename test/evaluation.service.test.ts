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
  assert.equal(report.overallScore, 4.7);
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
