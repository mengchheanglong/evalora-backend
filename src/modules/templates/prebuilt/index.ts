import { customerSuccessTemplate } from "./customer-success";
import { dataAnalystTemplate } from "./data-analyst";
import { frontendDeveloperTemplate } from "./frontend-developer";
import { hrGeneralistTemplate } from "./hr-generalist";
import { productManagerTemplate } from "./product-manager";
import { softwareEngineerTemplate } from "./software-engineer";
import { teamLeaderTemplate } from "./team-leader";
import type { PrebuiltAssessmentTemplateDefinition } from "./types";

export const PREBUILT_ASSESSMENT_TEMPLATES: PrebuiltAssessmentTemplateDefinition[] = [
  softwareEngineerTemplate,
  frontendDeveloperTemplate,
  productManagerTemplate,
  dataAnalystTemplate,
  teamLeaderTemplate,
  hrGeneralistTemplate,
  customerSuccessTemplate,
];

export * from "./seed-mappers";
export * from "./types";
