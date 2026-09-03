import { z } from "zod";
import { ok } from "./envelope.js";

/**
 * `/api/admin/ai` — the generation pipeline (file 34, FR-AI-01, FR-AI-08).
 *
 * **The response is a job id and nothing else.** Not the lesson, not the quiz,
 * not the model's text. A generation is not a thing an admin accepts at the
 * moment they ask for it — it is a thing that enters the review queue, and
 * returning the content here would invite a client to render it as though it were
 * ready. The drafts are read back through the CMS like any other content.
 *
 * `status` is `awaiting_review` or `failed` — never `approved`, `rejected` or
 * anything that implies a human has looked. A `failed` job still has a row, and
 * its `rawOutput` holds both attempts for whoever has to work out why.
 */
export const GenerationJobRefSchema = z
  .object({
    jobId: z.string(),
    status: z.enum(["awaiting_review", "failed"]),
  })
  .strict();

export type GenerationJobRef = z.infer<typeof GenerationJobRefSchema>;

export const GenerationJobRefResponseSchema = ok(GenerationJobRefSchema);

/**
 * What a batch narration can be asked for (file 36, FR-AI-04).
 *
 * Here rather than in `apps/server/src/schemas` because both sides need it: the
 * route validates against it and the CMS renders a "Generate narration" button per
 * entity from the same three names.
 */
export const NARRATION_ENTITIES = ["lesson", "story", "quiz"] as const;
export const NarrationEntitySchema = z.enum(NARRATION_ENTITIES);
export type NarrationEntity = z.infer<typeof NarrationEntitySchema>;

/**
 * The answer to a batch generation — narration or illustrations (file 36).
 *
 * **Three numbers, not one.** `jobIds` is the work started; `skipped` is the pairs
 * that already had media or already had a clip in the review queue. Without the
 * second, an eight-page story that produced three jobs looks like five failures,
 * and the admin's next move — click it again — is the wrong one.
 *
 * **`failed` counts the jobs in `jobIds` that produced nothing usable**, and it is
 * here because a batch cannot report failure any other way. The single-job
 * endpoints answer with a `status`, so their callers can say "the model gave us
 * nothing"; a batch has *n* statuses, and dropping them made a revoked provider key
 * on a sixteen-clip story read as "16 clips recorded" — a success message for work
 * that entirely failed. The jobs are still listed in `jobIds`: they exist, they
 * hold their own error, and `failed` is how many of them a reviewer should open
 * first.
 *
 * `jobIds` may be empty with a non-zero `skipped`, which is the ordinary result of
 * re-running the action on finished work. It is a `202` either way: nothing was
 * wrong with the request.
 */
export const BatchGenerationRefSchema = z
  .object({
    jobIds: z.array(z.string()),
    skipped: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  .strict();

export type BatchGenerationRef = z.infer<typeof BatchGenerationRefSchema>;

export const BatchGenerationRefResponseSchema = ok(BatchGenerationRefSchema);
