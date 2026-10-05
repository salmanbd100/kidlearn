import type { ZodIssue } from "zod";
import type { ApiFailure } from "@/shared/api/api-client";

/** Keys under the `parent` namespace, relative to it. */
type ParentMessageKey = string;

export function childWriteErrorKey(failure: ApiFailure): ParentMessageKey {
  switch (failure.code) {
    case "CONFLICT":
      return "errors.childLimit";
    case "CONSENT_REQUIRED":
      return "errors.consentRequired";
    case "NOT_FOUND":
      return "errors.notFound";
    default:
      return generalErrorKey(failure);
  }
}

export function screenTimeErrorKey(failure: ApiFailure): ParentMessageKey {
  return failure.code === "NOT_FOUND"
    ? "errors.notFound"
    : generalErrorKey(failure);
}

/** The fallback message for any failure with no screen-specific meaning. */
export function generalErrorKey(failure: ApiFailure): ParentMessageKey {
  return failure.code === "NETWORK_ERROR" ? "errors.network" : "errors.generic";
}

export type FieldErrors = Partial<Record<string, ParentMessageKey>>;

export function toFieldErrors(issues: readonly ZodIssue[]): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || errors[field] !== undefined) continue;
    errors[field] = messageKeyFor(field, issue.code);
  }

  return errors;
}

function messageKeyFor(
  field: string,
  code: ZodIssue["code"],
): ParentMessageKey {
  switch (field) {
    case "firstName":
      return code === "too_big"
        ? "form.errors.firstNameTooLong"
        : "form.errors.firstNameRequired";
    case "age":
      // Both bounds share one message: "between 3 and 6" answers either.
      return "form.errors.ageRange";
    case "gradeLevel":
      return "form.errors.gradeRequired";
    case "preferredLanguage":
      return "form.errors.languageRequired";
    case "avatarCharacterId":
      return "form.errors.avatarRequired";
    default:
      return "form.errors.invalid";
  }
}
