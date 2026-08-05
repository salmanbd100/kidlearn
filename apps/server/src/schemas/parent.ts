import { z } from "zod";

/**
 * Request schemas for `/api/parent`.
 *
 * These were inline in `routes/parent.ts` until file 12a. They moved here for two
 * reasons: it is where `schemas/children.ts` and `schemas/content.ts` already
 * live, and the OpenAPI document needs to import them to describe the request
 * bodies — a spec that restated these shapes by hand would be a second source of
 * truth, which is the thing this whole exercise exists to avoid.
 */

/** Exactly four digits — leading zeros are significant, so this is a string. */
export const PinSchema = z
  .string()
  .regex(/^\d{4}$/, "PIN must be exactly 4 digits");

export const SetPinSchema = z.object({
  pin: PinSchema,
  /** Required only when replacing an existing PIN; enforced in the service. */
  currentPin: PinSchema.optional(),
});

export const VerifyPinSchema = z.object({ pin: PinSchema });

export const ConsentSchema = z.object({
  // `literal(true)` and not `boolean()`: "accepted: false" is not a consent
  // record with a different value, it is an absence of consent.
  accepted: z.literal(true),
  version: z.string().min(1),
});

export const DeleteAccountSchema = z.object({
  confirmationToken: z.string().min(1),
});
