import {
  ActivityEventReportSchema,
  LearningTimeRangeSchema,
} from "@kidlearn/types";
import { z } from "zod";

export { ActivityEventReportSchema as ActivityEventBodySchema };

export const LearningTimeQuerySchema = z
  .object({ range: LearningTimeRangeSchema })
  .strict();

export type ActivityEventBody = z.infer<typeof ActivityEventReportSchema>;
export type LearningTimeQuery = z.infer<typeof LearningTimeQuerySchema>;
