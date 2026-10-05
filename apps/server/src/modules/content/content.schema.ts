import { z } from "zod";

export const ContentIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type ContentIdParams = z.infer<typeof ContentIdParamsSchema>;
