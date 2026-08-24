import { IsBoolean } from "class-validator";

export class UpdateIntegrityPolicyDto {
  @IsBoolean()
  pointerDetectionEnabled!: boolean;
}
