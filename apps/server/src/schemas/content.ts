import { z } from "zod";

/**
 * Route-boundary schemas for `/api/content/*` (`backend.md §2`).
 *
 * There is deliberately no query schema here. Grade and language are read from
 * the active child's server-side row only (FR-PROF-03), so these routes accept
 * no query input at all — anything a client appends is ignored.
 */
export const ContentIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type ContentIdParams = z.infer<typeof ContentIdParamsSchema>;
