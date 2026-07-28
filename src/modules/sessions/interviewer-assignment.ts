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
 * Owners can supervise every session. Interviewers can change the live
 * interview only when explicitly assigned; sessions without an explicit list
 * belong to their creator.
 */
export function canManageSessionFollowUps(session: AssignedSession, access?: AccessContext): boolean {
  if (!access) return false;
  if (access.role === "admin" || access.role === "organization") return true;
  if (access.role !== "interviewer") return false;

  const assignments = storedInterviewerAssignments(session.interviewers);
  if (assignments.length) return assignments.some((assignment) => assignment.id === access.userId);
  return session.createdById === access.userId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}
