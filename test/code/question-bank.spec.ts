import { CODE_QUESTION_INDEX, CODE_QUESTIONS } from "../../src/modules/code/constants/code.constants";

describe("Coding question bank integrity", () => {
  it("has a non-empty bank with unique ids", () => {
    expect(CODE_QUESTIONS.length).toBeGreaterThan(0);
    const ids = CODE_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("indexes every question by id", () => {
    expect(CODE_QUESTION_INDEX.size).toBe(CODE_QUESTIONS.length);
    for (const question of CODE_QUESTIONS) {
      expect(CODE_QUESTION_INDEX.get(question.id)).toBe(question);
    }
  });

  it("has well-formed, gradeable questions", () => {
    for (const q of CODE_QUESTIONS) {
      expect(q.id.trim()).not.toBe("");
      expect(q.title.trim()).not.toBe("");
      expect(q.description.trim()).not.toBe("");
      expect(q.starterCode.trim()).not.toBe("");
      expect(q.language).toBe("javascript");
      expect(["easy", "medium", "hard"]).toContain(q.difficulty);
      // Must have hidden cases to grade against.
      expect(q.testCases.length).toBeGreaterThan(0);
      for (const tc of q.testCases) {
        expect(typeof tc.stdin).toBe("string");
        expect(typeof tc.expectedOutput).toBe("string");
        expect(tc.expectedOutput.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every hidden test case within the DTO source-size limit when echoed", () => {
    // stdin fed to the sandbox must be small; guards against a pathological question.
    for (const q of CODE_QUESTIONS) {
      for (const tc of q.testCases) {
        expect(tc.stdin.length).toBeLessThan(16_000);
      }
    }
  });
});
