import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { Trim } from "../../../common/validation/decorators/transform.decorators";

const NOTE_MAX_LENGTH = 4000;

export class AddReviewerNoteDto {
  @IsString()
  @IsNotEmpty({ message: "Reviewer note cannot be empty." })
  @MaxLength(NOTE_MAX_LENGTH, { message: `Reviewer note cannot exceed ${NOTE_MAX_LENGTH} characters.` })
  @Trim()
  note!: string;
}
