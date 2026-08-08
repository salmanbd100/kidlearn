import { z } from "zod";
import { ERROR_CODES } from "./errors.js";

/**
 * The two response shapes the API sends. No route ever sends a bare body — the
 * rule is stated in `apps/server/src/lib/errors.ts` and enforced by these
 * schemas being the only thing the route tests accept.
 *
 * Success (2xx):  { "data": <payload> }
 * Failure (4xx/5xx): { "error": { "code", "message", "details"? } }
 */

/** Wraps a payload schema in the success envelope. */
export function ok<TSchema extends z.ZodTypeAny>(data: TSchema) {
  return z.object({ data }).strict();
}

export const ErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.enum(ERROR_CODES),
        message: z.string(),
        /**
         * Free-form, and shaped by the failure: `ZodError.flatten()` output
         * (`{ formErrors, fieldErrors }`) on a 400, and whatever `ApiError`
         * carried otherwise — e.g. `{ currentVersion }` on a consent-version
         * conflict. Deliberately not narrowed: a client must not depend on it.
         */
        details: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

/**
 * `ZodError.flatten()`, which is what `details` holds on a 400
 * `VALIDATION_FAILED`. Documented so the spec can show the shape a client will
 * actually receive from a rejected body, even though `details` stays `unknown`.
 */
export const ValidationDetailsSchema = z.object({
  formErrors: z.array(z.string()),
  fieldErrors: z.record(z.array(z.string())),
});

/**
 * A timestamp as it appears **on the wire**.
 *
 * The services type these fields as `Date`, but `res.json()` serialises them to
 * ISO-8601 strings. Every response schema in this directory uses this, never
 * `z.date()` — a schema built from the TypeScript type would be wrong about
 * every timestamp in the API and would fail the moment a test parsed a real
 * response body.
 */
export const IsoDateTimeSchema = z.string().datetime();
