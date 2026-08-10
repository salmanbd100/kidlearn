import { z } from "zod";

/**
 * The lesson-flow vocabulary, shared by the player and the server (FR-LSN-01..07).
 *
 * `LESSON_STEPS` is ordered, and the order **is** the contract: the player walks
 * it forwards and never skips, `resumeTarget` reads a successor from it, and the
 * server's monotonic guard compares indices in it. A step inserted in the middle
 * changes all three at once, which is the point of there being one array.
 *
 * It mirrors Prisma's `LessonStep` enum by hand, because this package may not
 * depend on `@kidlearn/db` (see the module docstring in `./index.ts`). The mirror
 * is checked rather than trusted: `apps/server/src/openapi/paths/progress.ts`
 * carries a compile-time assertion that the two still agree, so adding a step to
 * `schema.prisma` without adding it here fails `pnpm typecheck`.
 */
export const LESSON_STEPS = [
  "intro",
  "video",
  "activity",
  "quiz",
  "reward",
] as const;
export const LessonStepSchema = z.enum(LESSON_STEPS);
export type LessonStep = (typeof LESSON_STEPS)[number];

/** The step after `step`, or `null` at the end of the flow. */
export function nextLessonStep(step: LessonStep): LessonStep | null {
  return LESSON_STEPS[LESSON_STEPS.indexOf(step) + 1] ?? null;
}

/**
 * Where a lesson opens, given the last step the child **finished**.
 *
 * `null` — no saved progress — starts at the beginning. A `reward` that was
 * already finished has no successor, so a replay starts over rather than opening
 * on a screen the child has no way to leave forwards (FR-LSN-06).
 */
export function resumeLessonStep(lastCompleted: LessonStep | null): LessonStep {
  if (lastCompleted === null) return LESSON_STEPS[0];
  return nextLessonStep(lastCompleted) ?? LESSON_STEPS[0];
}

/**
 * `POST /api/progress/lessons/:id/step` — one finished step.
 *
 * The field is `completed`, without the `is` prefix `general.md §4` asks of a
 * boolean: this is the wire contract stated verbatim in the implementation specs
 * for files 16 and 23, and both halves of it are generated from this schema.
 * Renaming it here would silently break the client file 23 describes.
 *
 * `completed: true` is legal only alongside `step: "reward"` — it is what stamps
 * `LessonProgress.completedAt`, and a lesson is not finished until its last step
 * is. The rule is a `.superRefine`, so it is invisible in the generated JSON
 * Schema and is restated in the operation description (`backend.md §7`).
 */
export const LessonStepReportSchema = z
  .object({
    step: LessonStepSchema,
    completed: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.completed && value.step !== "reward") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completed"],
        message: 'completed may only be true when step is "reward"',
      });
    }
  });

export type LessonStepReport = z.infer<typeof LessonStepReportSchema>;

/**
 * The `SessionEvent` types the lesson player emits (FR-LSN-07, FR-TIME-06).
 *
 * A strict subset of Prisma's `SessionEventType`: `heartbeat` and the story
 * events have their own producers (files 26–27), and letting a client post any
 * member of the enum would let it forge the rows the screen-time budget is
 * computed from.
 */
export const LESSON_SESSION_EVENT_TYPES = [
  "lesson_start",
  "step_complete",
  "lesson_complete",
] as const;
export const LessonSessionEventTypeSchema = z.enum(LESSON_SESSION_EVENT_TYPES);
export type LessonSessionEventType = z.infer<
  typeof LessonSessionEventTypeSchema
>;

/**
 * `POST /api/progress/events` — one lesson-flow event.
 *
 * `clientTs` is accepted and **deliberately discarded**. `SessionEvent.occurredAt`
 * is stamped by the server, because learning-time and screen-time limits are
 * derived from these rows (FR-TIME-06) and a client that could backdate an event
 * could spend an afternoon inside a 30-minute budget. It stays in the contract so
 * the field a client naturally sends is a documented no-op rather than a `400`
 * from the strict object.
 */
export const SessionEventReportSchema = z
  .object({
    type: LessonSessionEventTypeSchema,
    lessonId: z.string().uuid(),
    /** Present on `step_complete`, absent on the two lesson-level events. */
    step: LessonStepSchema.optional(),
    clientTs: z.string().datetime(),
  })
  .strict();

export type SessionEventReport = z.infer<typeof SessionEventReportSchema>;
