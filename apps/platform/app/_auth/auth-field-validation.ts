export type AuthFieldErrorCode =
  | "email_required"
  | "email_invalid"
  | "first_name_required"
  | "consent_required";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function emailFieldError(value: string): AuthFieldErrorCode | null {
  const normalized = value.trim();
  if (!normalized) return "email_required";
  if (normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    return "email_invalid";
  }
  return null;
}

export function firstNameFieldError(value: string): AuthFieldErrorCode | null {
  return value.trim() ? null : "first_name_required";
}

export function consentFieldError(accepted: boolean): AuthFieldErrorCode | null {
  return accepted ? null : "consent_required";
}
