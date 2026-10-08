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
  /** Today's parental screen-time allowance is used up (FR-TIME-02); a `423` on content-start endpoints. */
  "TIME_LIMIT_REACHED",
  /** The clock is outside the parent's allowed access window (FR-TIME-04). */
  "OUTSIDE_WINDOW",
  /**
   * Today's AI generation cap for this cost bucket is used up: a `429` on `/api/admin/ai/generate/*`
   * with `{ used, pending, cap }` in `details`; resets at midnight in `APP_TIMEZONE`.
   * Also the `429` from the per-IP flood guard on every `/api/*` route (no `details`, `RateLimit` header).
   */
  "RATE_LIMITED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
