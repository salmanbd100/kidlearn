import { z } from "zod";

// Request schemas for `/api/parent`.

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
