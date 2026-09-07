import { IsBoolean } from "class-validator";

<<<<<<< HEAD
export class UpdateIntegrityPolicyDto {
  @IsBoolean()
  pointerDetectionEnabled!: boolean;
=======
/** Staff-only session integrity settings. Candidates can never update policy. */
export class UpdateIntegrityPolicyDto {
  @IsBoolean()
  detectionEnabled!: boolean;
>>>>>>> 947ba6e02bf239b43cee3d87daa1dcc512dcdca2
}
