import type { PrebuiltAssessmentTemplateDefinition } from "../types";
import { softwareAiInterviewModule } from "./ai-interview";
import { softwareCodingModule } from "./coding";
import { softwareDebuggingModule } from "./debugging";
import { softwareSystemDesignModule } from "./system-design";
import { softwareCommunicationModule } from "./communication";
import { softwareWorkStyleModule } from "./work-style";
import { softwareBehavioralModule } from "./behavioral";

export const softwareEngineerTemplate: PrebuiltAssessmentTemplateDefinition = {
  "id": "prebuilt-software-engineer-assessment",
  "title": "Software Engineer Assessment",
  "description": "Research-backed technical assessment covering coding, debugging, system design, testing, communication, product judgment, collaboration, and AI-assisted development discipline.",
  "roleType": "Software Engineer",
  "timeLimitMin": 90,
  "scoringRules": {
    "passScore": 3.6,
    "scale": "1-5",
    "source": "prebuilt-researched-v2",
    "recommendedCandidateQuestionCount": {
      "min": 10,
      "max": 15,
      "practicalTasks": 1
    },
    "researchBasis": [
      "Meta coding/design/behavioral loop",
      "Microsoft engineering lifecycle: problem solving, design, coding, testing",
      "Uber coding plus design plus collaboration",
      "Palantir code quality/open-ended systems",
      "GitLab AI-native engineering judgment",
      "Automattic real-world coding challenge"
    ],
    "notes": "Select a balanced subset plus one practical coding/debugging task. Code execution must stay in the frontend/sandbox lane; backend evaluates submitted code and evidence."
  },
  "modules": [
    softwareAiInterviewModule,
    softwareCodingModule,
    softwareDebuggingModule,
    softwareSystemDesignModule,
    softwareCommunicationModule,
    softwareWorkStyleModule,
    softwareBehavioralModule,
  ],
};
