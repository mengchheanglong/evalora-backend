import { hrGeneralistTemplate } from "./hr-generalist";
import { softwareEngineerTemplate } from "./software-engineer";
import { teamLeaderTemplate } from "./team-leader";
import type { PrebuiltAssessmentTemplateDefinition } from "./types";

export const PREBUILT_ASSESSMENT_TEMPLATES: PrebuiltAssessmentTemplateDefinition[] = [
  hrGeneralistTemplate,
  softwareEngineerTemplate,
  teamLeaderTemplate,
];

export * from "./seed-mappers";
export * from "./types";
