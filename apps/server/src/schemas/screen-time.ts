/**
 * Request schema for `PATCH /api/children/{id}/screen-time` (`backend.md §2`).
 *
 * The shape lives in `@kidlearn/types` because the parent form `safeParse`s the
 * same object before it submits, so a limit the picker offers cannot drift from
 * the set the server accepts. This file stays the import path `validate()` and the
 * OpenAPI document use, matching `schemas/events.ts` and `schemas/children.ts`.
 */
import { ScreenTimeUpdateSchema } from "@kidlearn/types";
import type { z } from "zod";

export { ScreenTimeUpdateSchema as ScreenTimeBodySchema };

export type ScreenTimeBody = z.infer<typeof ScreenTimeUpdateSchema>;
