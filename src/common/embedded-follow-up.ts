/**
 * The candidate app stores an AI follow-up exchange inside the parent response's
 * text column rather than in a row of its own:
 *
 *   <candidate answer>\n\nAI follow-up: <model question>\nFollow-up response: <candidate answer>
 *
 * Two things read that column and neither may treat the model's question as the
 * candidate's words: the report scorer (where question wording inflates a score
 * and can be quoted back as candidate "evidence") and the reviewer transcript
 * (where it renders under a "Candidate answer" heading). Rewriting what is stored
 * would move every existing report's score, so both split it on read — through
 * this one parser, because two copies of a format this fragile will drift.
 *
 * The markers can be absent, repeated, or typed by a candidate quoting them, so
 * only the exact shape the app writes is split; anything ambiguous is left whole,
 * where no text can be lost.
 */

export const AI_FOLLOW_UP_MARKER = "\n\nAI follow-up: ";
export const FOLLOW_UP_ANSWER_MARKER = "\nFollow-up response: ";

export interface EmbeddedFollowUpSplit {
  /** The candidate's own answer to the parent question. */
  answerText?: string;
  /** The model-authored follow-up, when one could be told apart unambiguously. */
  followUp?: { questionText: string; answerText?: string };
}

export interface StructuredAiFollowUp {
  questionText?: string;
  answerText?: string;
}

function trimmedOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export function splitEmbeddedFollowUp(responseText: string): EmbeddedFollowUpSplit {
  const start = responseText.indexOf(AI_FOLLOW_UP_MARKER);
  // A second marker cannot be told apart from a candidate quoting the first.
  if (start === -1 || responseText.includes(AI_FOLLOW_UP_MARKER, start + 1)) {
    return { answerText: trimmedOrUndefined(responseText) };
  }

  const remainder = responseText.slice(start + AI_FOLLOW_UP_MARKER.length);
  const split = remainder.indexOf(FOLLOW_UP_ANSWER_MARKER);
  if (split === -1) return { answerText: trimmedOrUndefined(responseText) };

  const questionText = trimmedOrUndefined(remainder.slice(0, split));
  const answerText = trimmedOrUndefined(remainder.slice(split + FOLLOW_UP_ANSWER_MARKER.length));
  // An unanswered follow-up still has to come out: the app writes the marker block
  // as soon as the question appears, so leaving it in place would score a
  // model-authored question as the candidate's own words. Only a missing question
  // is genuinely ambiguous.
  if (!questionText) return { answerText: trimmedOrUndefined(responseText) };

  return {
    answerText: trimmedOrUndefined(responseText.slice(0, start)),
    followUp: { questionText, answerText },
  };
}

/**
 * New rows keep the AI exchange out of responseText. The question is included
 * for reload compatibility, while reports still treat it as context only.
 */
export function readStructuredAiFollowUp(value: unknown): StructuredAiFollowUp | undefined {
  if (!isRecord(value) || !isRecord(value.aiFollowUp)) return undefined;
  const questionText = trimmedOrUndefined(
    typeof value.aiFollowUp.question === "string" ? value.aiFollowUp.question : "",
  );
  const answerText = trimmedOrUndefined(
    typeof value.aiFollowUp.answer === "string" ? value.aiFollowUp.answer : "",
  );
  return questionText || answerText ? { questionText, answerText } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
