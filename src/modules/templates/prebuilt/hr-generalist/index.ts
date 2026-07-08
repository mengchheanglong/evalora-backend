import type { PrebuiltAssessmentTemplateDefinition } from "../types";
import { hrBehavioralModule } from "./behavioral";
import { hrCommunicationModule } from "./communication";
import { hrWorkStyleModule } from "./work-style";
import { hrProblemSolvingModule } from "./problem-solving";
import { hrLeadershipModule } from "./leadership";
import { hrAiEthicsModule } from "./ai-ethics";

export const hrGeneralistTemplate: PrebuiltAssessmentTemplateDefinition = {
  "id": "prebuilt-hr-generalist-assessment",
  "title": "HR Generalist Assessment",
  "description": "Research-backed prebuilt HR assessment covering STAR behavior, employee relations judgment, candidate communication, HR operations, ethics, and data-informed people-process improvement.",
  "roleType": "HR Generalist",
  "timeLimitMin": 75,
  "scoringRules": {
    "passScore": 3.5,
    "scale": "1-5",
    "source": "prebuilt-researched-v2",
    "recommendedCandidateQuestionCount": {
      "min": 10,
      "max": 14
    },
    "researchBasis": [
      "Amazon Leadership Principles behavioral loops",
      "Oracle STAR competency interviews",
      "PwC competency and business interviews",
      "Accenture behavioral scenarios",
      "Deloitte situational and behavioral questioning"
    ],
    "notes": "Use as an editable starter bank. Assign only a subset per candidate so the experience stays realistic."
  },
  "modules": [
    hrBehavioralModule,
    hrCommunicationModule,
    hrWorkStyleModule,
    hrProblemSolvingModule,
    hrLeadershipModule,
    hrAiEthicsModule,
  ],
};
