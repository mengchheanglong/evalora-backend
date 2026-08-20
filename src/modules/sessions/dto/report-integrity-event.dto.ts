import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

/** Event types the candidate browser is allowed to report. */
export const INTEGRITY_EVENT_TYPES = ["visibilitychange", "blur", "pagehide", "beforeunload"] as const;

export type IntegrityEventType = (typeof INTEGRITY_EVENT_TYPES)[number];

const MAX_CLIENT_EVENT_ID_LENGTH = 200;
const MAX_DURATION_MS = 100 * 60 * 60 * 1_000;

/**
 * Candidate-reported integrity signal.
 *
 * The body is intentionally narrow: whitelisting rejects `warningCount`,
 * `status`, or any enforcement field before it can reach the service, so the
 * browser can never author an official warning or a session transition.
 */
export class ReportIntegrityEventDto {
  @IsString()
  @IsUUID()
  clientEventId!: string;

  @IsIn(INTEGRITY_EVENT_TYPES)
  type!: IntegrityEventType;

  @IsISO8601()
  detectedAt!: string;

  @IsOptional()
  @IsISO8601()
  returnedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DURATION_MS)
  durationMs?: number;

  // Defensive copy guard: no extra length cap is needed because IsString above
  // already bounds the type, but keep the id bounded so a hostile client cannot
  // bloat the composite unique key.
  static readonly maxClientEventIdLength = MAX_CLIENT_EVENT_ID_LENGTH;
}
