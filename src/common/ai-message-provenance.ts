interface AiMessageProvenanceRow {
  id: string;
  role: string;
  metadata?: unknown;
  createdAt?: Date | string | null;
}

/**
 * Returns the template question each AI follow-up was based on.
 *
 * New rows carry basedOnQuestion directly. Older transactions wrote a candidate
 * message with metadata.question and the assistant message at the same timestamp;
 * a unique pair can be recovered without relying on unstable row ordering.
 */
export function basedOnQuestionByAssistantId(
  messages: AiMessageProvenanceRow[],
): Map<string, string> {
  const result = new Map<string, string>();
  const legacyCandidatesByTime = new Map<number, string[]>();

  for (const message of messages) {
    if (message.role !== "candidate") continue;
    const question = metadataString(message.metadata, "question");
    const timestamp = timeValue(message.createdAt);
    if (!question || timestamp === undefined) continue;
    const candidates = legacyCandidatesByTime.get(timestamp) ?? [];
    candidates.push(question);
    legacyCandidatesByTime.set(timestamp, candidates);
  }

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const direct = metadataString(message.metadata, "basedOnQuestion");
    if (direct) {
      result.set(message.id, direct);
      continue;
    }

    const timestamp = timeValue(message.createdAt);
    const candidates = timestamp === undefined ? undefined : legacyCandidatesByTime.get(timestamp);
    if (candidates?.length === 1) result.set(message.id, candidates[0]);
  }

  return result;
}

function metadataString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

function timeValue(value: Date | string | null | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
