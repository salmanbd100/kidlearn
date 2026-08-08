import type { ZodIssue } from "zod";
import type { ApiFailure } from "./api-client";

/**
 * Turning failures into i18next keys.
 *
 * Two rules hold throughout:
 *
 *  - **Branch on `error.code`, never on `error.message`.** The message is a
 *    developer hint and may be reworded at any time; the code is the contract.
 *  - **Never render a server message to a parent.** They are English-only and
 *    written for whoever is reading the logs. Every string a parent sees comes
 *    from `locales/*\/parent.json`.
 */

/** Keys under the `parent` namespace, relative to it. */
type ParentMessageKey = string;

/**
 * The message for a failed `POST /api/children`.
 *
 * The five-profile cap arrives as a plain `409 CONFLICT` — not, as this file's
 * spec assumed, a `CHILD_LIMIT_REACHED` code. `createChildProfile` raises it with
 * `ApiError.conflict`, and it is the only conflict that route can produce (see
 * `openapi/paths/children.ts`), so the mapping is sound. Kept in one named
 * function rather than inline in the form, because it is the second half of the
 * max-5 rule and belongs next to the first.
 */
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

/** The fallback message for any failure with no screen-specific meaning. */
export function generalErrorKey(failure: ApiFailure): ParentMessageKey {
  return failure.code === "NETWORK_ERROR" ? "errors.network" : "errors.generic";
}

/**
 * The message for a rejected PIN.
 *
 * `PIN_LOCKED` and `PIN_INVALID` are separate screens' worth of difference: one
 * says "try again", the other says "stop trying for a while". The server does not
 * report attempts remaining — deliberately, since that number is a hint to
 * whoever is guessing — so neither message names one.
 */
export function pinErrorKey(failure: ApiFailure): ParentMessageKey {
  switch (failure.code) {
    case "PIN_INVALID":
      return "pin.invalid";
    case "PIN_LOCKED":
      return "pin.locked";
    case "PIN_REQUIRED":
      return "pin.notSet";
    default:
      return generalErrorKey(failure);
  }
}

/** Which field of the profile form an issue belongs to, and what it says. */
export type FieldErrors = Partial<Record<string, ParentMessageKey>>;

/**
 * Maps Zod issues onto localized field messages.
 *
 * Keyed on the field plus the issue `code` rather than on Zod's own message: those
 * messages are English strings from a validation library ("String must contain at
 * most 50 character(s)"), and showing one to a parent would both leak the
 * implementation and ignore the Bangla locale. The *rules* still come from the one
 * schema in `@kidlearn/types` — only the wording is local.
 *
 * First issue per field wins; a field with two problems has one message.
 */
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
