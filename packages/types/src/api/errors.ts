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
   * Today's AI generation cap for this cost bucket is used up: a `429` on `/api/admin/ai/generate/*`
   * with `{ used, pending, cap }` in `details`; resets at midnight in `APP_TIMEZONE`.
   * Also the `429` from the per-IP flood guard on every `/api/*` route (no `details`, `RateLimit` header).
   */
  "RATE_LIMITED",
  /** A `503` on `/api/admin/ai/generate/{lesson,story,quiz,illustrations}` when `GEMINI_API_KEY` is unset (FR-AI-10). */
  "AI_PROVIDER_NOT_CONFIGURED",
  /** A `405` on `GET`/`DELETE /mcp`: the MCP endpoint is stateless, so there is no session to resume or end. */
  "METHOD_NOT_ALLOWED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
