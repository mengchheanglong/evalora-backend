import { IsBoolean } from "class-validator";

/** Staff-only session integrity settings. Candidates can never update policy. */
export class UpdateIntegrityPolicyDto {
  @IsBoolean()
  detectionEnabled!: boolean;
}
