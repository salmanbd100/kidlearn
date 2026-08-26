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
