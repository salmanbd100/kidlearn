/**
 * Request schema for `PATCH /api/children/{id}/screen-time` (`backend.md §2`).
 */
import { ScreenTimeUpdateSchema } from "@kidlearn/types";
import type { z } from "zod";

export { ScreenTimeUpdateSchema as ScreenTimeBodySchema };

export type ScreenTimeBody = z.infer<typeof ScreenTimeUpdateSchema>;
