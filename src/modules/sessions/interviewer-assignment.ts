import type { AccessContext } from "../auth/access-control";

export interface StoredInterviewerAssignment {
  id: string;
  name: string;
}

interface AssignedSession {
  createdById?: string | null;
  interviewers?: unknown;
}

export function storedInterviewerAssignments(value: unknown): StoredInterviewerAssignment[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const assignments: StoredInterviewerAssignment[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = optionalString(item.id);
    const name = optionalString(item.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    assignments.push({ id, name });
  }
  return assignments;
}

export function storedInterviewerNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of value) {
    const name = typeof item === "string"
      ? item.trim()
      : isRecord(item)
        ? optionalString(item.name)
        : undefined;
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/**
 * A session's live questioning belongs to its explicitly assigned interviewers.
 * When no assignment is made, it falls back to the session creator. Workspace
 * membership grants visibility, not the ability to intervene in a live session.
 */
export function canManageSessionFollowUps(session: AssignedSession, access?: AccessContext): boolean {
  if (!access) return false;
  if (access.role === "admin") return true;
  if (access.role !== "organization" && access.role !== "interviewer") return false;

  const assignments = storedInterviewerAssignments(session.interviewers);
  if (hasExplicitInterviewerList(session.interviewers)) return assignments.some((assignment) => assignment.id === access.userId);
  return session.createdById === access.userId;
}

function hasExplicitInterviewerList(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => {
    if (typeof item === "string") return Boolean(item.trim());
    return isRecord(item) && Boolean(optionalString(item.id) || optionalString(item.name));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}
