// The API's error vocabulary.

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL",
  /** COPPA consent has not been recorded for this parent yet. */
  "CONSENT_REQUIRED",
  /**
   * Today's AI generation cap for this cost bucket is used up (file 36). A `429`
   * on `/api/admin/ai/generate/*`; `error.details` carries `{ used, pending, cap }`
   * so the CMS can say how much budget is left rather than only that there is
   * none. Resets at midnight in the deployment's `APP_TIMEZONE`.
   */
  "RATE_LIMITED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
