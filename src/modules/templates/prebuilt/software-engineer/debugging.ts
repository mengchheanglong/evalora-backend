import type { PrebuiltModuleDefinition } from "../types";

export const softwareDebuggingModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-se-debugging",
  "type": "debugging",
  "title": "Debugging and Testing Task",
  "description": "Assesses structured investigation, safe remediation, test discipline, and prevention under production constraints.",
  "weight": 1.25,
  "orderIndex": 3,
  "settings": {
    "recommendedMinutes": 15
  },
  "questions": [
    {
      "id": "prebuilt-se-debugging-slow-api",
      "questionText": "An API endpoint became five times slower after a deployment. Walk through how you would diagnose, mitigate, and prevent the issue from recurring.",
      "questionType": "scenario",
      "rubric": [
        "hypothesis-building",
        "observability",
        "rollback-safety",
        "root-cause-analysis",
        "prevention"
      ]
    },
    {
      "id": "prebuilt-se-debugging-flaky-test",
      "questionText": "A test fails randomly in CI but passes locally. What steps do you take before disabling it?",
      "questionType": "scenario",
      "rubric": [
        "reproducibility",
        "test-isolation",
        "root-cause-analysis",
        "quality-discipline"
      ]
    },
    {
      "id": "prebuilt-se-debugging-memory",
      "questionText": "A service slowly consumes more memory over several hours. What evidence would you collect and what fixes might you consider?",
      "questionType": "scenario",
      "rubric": [
        "instrumentation",
        "hypothesis-building",
        "resource-awareness",
        "safe-fix-plan"
      ]
    },
    {
      "id": "prebuilt-se-debugging-null",
      "questionText": "Users report occasional crashes from a null value that logs do not fully explain. How would you debug and test the fix?",
      "questionType": "scenario",
      "rubric": [
        "log-analysis",
        "defensive-coding",
        "regression-tests",
        "user-impact"
      ]
    },
    {
      "id": "prebuilt-se-debugging-deployment",
      "questionText": "A deployment fails only in staging because of an environment variable issue. How do you fix it and prevent repeat incidents?",
      "questionType": "scenario",
      "rubric": [
        "configuration-management",
        "validation",
        "documentation",
        "automation"
      ]
    },
    {
      "id": "prebuilt-se-debugging-data",
      "questionText": "A report shows inconsistent totals between two screens. How do you determine whether the issue is frontend, backend, or data-related?",
      "questionType": "scenario",
      "rubric": [
        "systematic-debugging",
        "data-tracing",
        "api-contract-awareness",
        "communication"
      ]
    }
  ]
};
