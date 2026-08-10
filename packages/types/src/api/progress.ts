import { z } from "zod";
import { LessonStepSchema } from "../progress.js";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/progress` — where the lesson player's progress is recorded (FR-LSN-06..07).
 *
 * Everything here is written by the server and read back by the client, never the
 * other way round. The client reports *that a step finished*; what `currentStep`
 * then holds, and whether the lesson counts as complete, is the server's decision
 * (spec §7 — progress is server-authoritative).
 */

/**
 * One child's position in one lesson.
 *
 * `currentStep` is the last step the child **finished**, not the one they are
 * looking at — which is why a resume target is its successor and not itself. A
 * brand-new row therefore cannot use it to mean "nothing done yet"; that state is
 * the absent row, and `GET` answers `null` for it.
 */
export const LessonProgressSchema = z
  .object({
    lessonId: z.string(),
    currentStep: LessonStepSchema,
    /** Set once the reward step is reported complete. Survives every replay. */
    completedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export type LessonProgressResponse = z.infer<typeof LessonProgressSchema>;

/**
 * `null` when this child has never opened this lesson.
 *
 * Distinguishable from a fresh row on purpose: `currentStep` means "finished", so
 * there is no value it could carry to say "started but nothing done". The player
 * reads the absence and opens at `intro`.
 */
export const LessonProgressReadResponseSchema = ok(
  z.object({ progress: LessonProgressSchema.nullable() }).strict(),
);

export const LessonProgressResponseSchema = ok(
  z.object({ progress: LessonProgressSchema }).strict(),
);

/**
 * The acknowledgement of a recorded `SessionEvent`.
 *
 * `occurredAt` is echoed because it is the server's timestamp and not the
 * `clientTs` that was sent (FR-TIME-06) — a client comparing the two can see its
 * own clock skew, and a reader of the spec can see that the field it sent was
 * discarded.
 */
export const SessionEventRecordSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    occurredAt: IsoDateTimeSchema,
  })
  .strict();

export type SessionEventRecordResponse = z.infer<
  typeof SessionEventRecordSchema
>;

export const SessionEventResponseSchema = ok(
  z.object({ event: SessionEventRecordSchema }).strict(),
);
