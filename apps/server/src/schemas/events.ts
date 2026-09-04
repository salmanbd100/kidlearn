/**
 * Request schemas for `/api/events` and the learning-time read (`backend.md §2`).
 */
import {
  ActivityEventReportSchema,
  LearningTimeRangeSchema,
} from "@kidlearn/types";
import { z } from "zod";

export { ActivityEventReportSchema as ActivityEventBodySchema };

/** `?range=today|week|month`, required. */
export const LearningTimeQuerySchema = z
  .object({ range: LearningTimeRangeSchema })
  .strict();

export type ActivityEventBody = z.infer<typeof ActivityEventReportSchema>;
export type LearningTimeQuery = z.infer<typeof LearningTimeQuerySchema>;
