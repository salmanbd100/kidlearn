import { z } from "zod";
import { ERROR_CODES } from "./errors.js";

/** The two response shapes the API sends; no route sends a bare body (rule in `apps/server/src/lib/errors.ts`). */

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
         * Free-form: `ZodError.flatten()` on a 400, otherwise whatever `ApiError` carried
         * (e.g. `{ currentVersion }`). Deliberately not narrowed: a client must not depend on it.
         */
        details: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

/**
 * `ZodError.flatten()`, what `details` holds on a 400 `VALIDATION_FAILED`; documented so the spec
 * shows the shape even though `details` stays `unknown`.
 */
export const ValidationDetailsSchema = z.object({
  formErrors: z.array(z.string()),
  fieldErrors: z.record(z.array(z.string())),
});

/** A timestamp as it appears **on the wire**. */
export const IsoDateTimeSchema = z.string().datetime();
