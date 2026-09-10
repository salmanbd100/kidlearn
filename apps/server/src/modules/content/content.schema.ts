import { z } from "zod";

/** Route-boundary schemas for `/api/content/*` (`backend.md §2`). */
export const ContentIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type ContentIdParams = z.infer<typeof ContentIdParamsSchema>;
