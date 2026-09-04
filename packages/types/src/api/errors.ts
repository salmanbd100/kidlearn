// The API's error vocabulary.

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL",
  /** No PIN has been set on this account yet — route to PIN setup. */
  "PIN_REQUIRED",
  /** A PIN exists but this session has no live 15-minute grant. */
  "PIN_VERIFICATION_REQUIRED",
  /** The submitted PIN was wrong. */
  "PIN_INVALID",
  /** Too many wrong attempts; the account is in its cool-off window. */
  "PIN_LOCKED",
  /** COPPA consent has not been recorded for this parent yet. */
  "CONSENT_REQUIRED",
  /**
   * Today's parental screen-time allowance is used up (FR-TIME-02). A `423` on a
   * content-start endpoint; the student surface turns it into a mascot screen.
   */
  "TIME_LIMIT_REACHED",
  /** The clock is outside the parent's allowed access window (FR-TIME-04). */
  "OUTSIDE_WINDOW",
  /**
   * Today's AI generation cap for this cost bucket is used up (file 36). A `429`
   * on `/api/admin/ai/generate/*`; `error.details` carries `{ used, pending, cap }`
   * so the CMS can say how much budget is left rather than only that there is
   * none. Resets at midnight in the deployment's `APP_TIMEZONE`.
   */
  "RATE_LIMITED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
