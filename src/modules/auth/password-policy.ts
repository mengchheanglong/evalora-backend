/**
 * Shared workspace password policy for register, invite accept, and reset.
 * Keep messages stable so API clients can surface them directly.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordRuleId = "length" | "lowercase" | "uppercase" | "number";

export interface PasswordRule {
  id: PasswordRuleId;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "lowercase",
    label: "Include a lowercase letter",
    test: (password) => /[a-z]/.test(password),
  },
  {
    id: "uppercase",
    label: "Include an uppercase letter",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    id: "number",
    label: "Include a number",
    test: (password) => /\d/.test(password),
  },
];

/** Returns a human-readable failure message, or null when the password is valid. */
export function passwordPolicyError(password: string): string | null {
  if (!password) return "Password is required.";
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }

  const failed = PASSWORD_RULES.filter((rule) => !rule.test(password));
  if (!failed.length) return null;

  if (failed.length === 1) {
    if (failed[0].id === "length") {
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    }
    return `Password must ${failed[0].label.charAt(0).toLowerCase()}${failed[0].label.slice(1)}.`;
  }

  return "Password must be at least 8 characters and include uppercase, lowercase, and a number.";
}

export function assertPasswordPolicy(password: string | undefined): string {
  const value = password ?? "";
  const error = passwordPolicyError(value);
  if (error) throw new Error(error);
  return value;
}
