import { z } from "zod";

// Request schemas for `/api/parent`.

export const ConsentSchema = z.object({
  // `literal(true)` and not `boolean()`: "accepted: false" is not a consent
  // record with a different value, it is an absence of consent.
  accepted: z.literal(true),
  version: z.string().min(1),
});

export const DeleteAccountSchema = z.object({
  confirmationToken: z.string().min(1),
});
