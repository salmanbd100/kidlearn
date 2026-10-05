import { z } from "zod";

export const ConsentSchema = z.object({
  // `literal(true)`, not `boolean()`: "accepted: false" is an absence of consent, not a record.
  accepted: z.literal(true),
  version: z.string().min(1),
});

export const DeleteAccountSchema = z.object({
  confirmationToken: z.string().min(1),
});
