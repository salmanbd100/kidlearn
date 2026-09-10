/** Request schemas for `/api/children`. */
import type { Language } from "@kidlearn/db";
import {
  ChildProfileCreateSchema,
  ChildProfileUpdateSchema,
} from "@kidlearn/types";
import { z } from "zod";

/** Language mirror, checked rather than trusted. */
type MirroredLanguage = z.infer<
  typeof ChildProfileCreateSchema
>["preferredLanguage"];

const _languageMirrorIsExhaustive: [
  Language extends MirroredLanguage ? true : never,
  MirroredLanguage extends Language ? true : never,
] = [true, true];
void _languageMirrorIsExhaustive;

export {
  ChildProfileCreateSchema as CreateChildBodySchema,
  ChildProfileUpdateSchema as UpdateChildBodySchema,
};

export const ChildIdParamsSchema = z.object({ id: z.string().min(1) });

export type CreateChildBody = z.infer<typeof ChildProfileCreateSchema>;
export type UpdateChildBody = z.infer<typeof ChildProfileUpdateSchema>;
