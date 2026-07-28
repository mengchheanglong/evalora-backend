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
        "list candidate causes before changing anything",
        "name the traces, metrics, or logs to compare",
        "restore service first, then investigate",
        "confirm the cause with evidence, not a guess",
        "add an alert or check that catches it earlier"
      ]
    },
    {
      "id": "prebuilt-se-debugging-flaky-test",
      "questionText": "A test fails randomly in CI but passes locally. What steps do you take before disabling it?",
      "questionType": "scenario",
      "rubric": [
        "try to reproduce the failure on demand",
        "look for shared state, timing, or ordering",
        "explain the real cause before touching the test",
        "treat disabling the test as a last resort"
      ]
    },
    {
      "id": "prebuilt-se-debugging-memory",
      "questionText": "A service slowly consumes more memory over several hours. What evidence would you collect and what fixes might you consider?",
      "questionType": "scenario",
      "rubric": [
        "collect heap or memory usage over time",
        "name likely causes such as retained references",
        "connect the growth to a specific code path",
        "propose a fix that can be verified and reverted"
      ]
    },
    {
      "id": "prebuilt-se-debugging-null",
      "questionText": "Users report occasional crashes from a null value that logs do not fully explain. How would you debug and test the fix?",
      "questionType": "scenario",
      "rubric": [
        "use the logs to narrow when it happens",
        "add the logging that was missing",
        "handle the missing value at its source",
        "add a test that fails before the fix",
        "say how many users are affected"
      ]
    },
    {
      "id": "prebuilt-se-debugging-deployment",
      "questionText": "A deployment fails only in staging because of an environment variable issue. How do you fix it and prevent repeat incidents?",
      "questionType": "scenario",
      "rubric": [
        "compare the environments to find the difference",
        "validate required config at startup",
        "record the setting where the team will find it",
        "automate the check so it fails early"
      ]
    },
    {
      "id": "prebuilt-se-debugging-data",
      "questionText": "A report shows inconsistent totals between two screens. How do you determine whether the issue is frontend, backend, or data-related?",
      "questionType": "scenario",
      "rubric": [
        "narrow down the layer before blaming one team",
        "compare the same query at each layer",
        "check the api response against what the screen shows",
        "report the finding without guessing"
      ]
    }
  ]
};
