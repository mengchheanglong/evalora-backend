import type { PrebuiltAssessmentTemplateDefinition } from "../types";
import { teamLeaderLeadershipModule } from "./leadership";
import { teamLeaderCommunicationModule } from "./communication";
import { teamLeaderBehavioralModule } from "./behavioral";
import { teamLeaderProblemSolvingModule } from "./problem-solving";
import { teamLeaderWorkStyleModule } from "./work-style";
import { teamLeaderAiInterviewModule } from "./ai-interview";

export const teamLeaderTemplate: PrebuiltAssessmentTemplateDefinition = {
  "id": "prebuilt-team-leader-assessment",
  "title": "Team Leader Assessment",
  "description": "Research-backed leadership assessment covering prioritization, conflict handling, feedback, communication, team operating rhythm, metrics, ethics, and AI-era team guidance.",
  "roleType": "Team Leader",
  "timeLimitMin": 75,
  "scoringRules": {
    "passScore": 3.6,
    "scale": "1-5",
    "source": "prebuilt-researched-v2",
    "recommendedCandidateQuestionCount": {
      "min": 10,
      "max": 14
    },
    "researchBasis": [
      "Amazon behavioral leadership loops",
      "Uber engineering manager leadership interviews",
      "Shopify Life Story interview",
      "Wise product/cross-functional interviews",
      "PwC/Deloitte case and competency interviews"
    ],
    "notes": "Use for team lead, supervisor, project lead, or junior manager screens. Assign a subset so interviews stay focused."
  },
  "modules": [
    teamLeaderLeadershipModule,
    teamLeaderCommunicationModule,
    teamLeaderBehavioralModule,
    teamLeaderProblemSolvingModule,
    teamLeaderWorkStyleModule,
    teamLeaderAiInterviewModule,
  ],
};
