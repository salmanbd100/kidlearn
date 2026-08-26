import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonRequestBody,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
  VALIDATION_RESPONSE,
} from "../components.js";
import type { RouteDoc } from "../route-doc.js";

/**
 * `routes/admin/ai.ts` — the AI generation pipeline (file 34, FR-AI-01, FR-AI-08).
 */

const ADMIN_FORBIDDEN_RESPONSE = errorResponse(
  "Authenticated, but not an administrator. Every signed-in *parent* lands here — see `GET /api/admin/me` for why a valid session is not enough.",
  ["FORBIDDEN"],
);

const GENERATE_LESSON_DESCRIPTION = [
  "Writes a complete draft lesson — a per-locale title, objectives, intro script, narration script and a schema-valid quiz — from a grade, a topic and a one-line focus (FR-AI-01).",
  "",
  "**Nothing this endpoint creates is visible to a child, and that is structural rather than a policy.** Every row it writes takes the `draft` default on its `status` column and carries the creating job's id; the student API filters `status = published`, so a generated lesson answers `404` to a learner until an administrator has moved it through review (FR-AI-07). No code path behind this operation can write any other status.",
  "",
  "**`202`, not `201`.** The generation is awaited inline — this deployment has no worker and no queue, so a background job would be a promise it could not keep — but what comes back is a *job to look up*, not a lesson to use. The reply is deliberately just `{ jobId, status }`: returning the content here would invite a client to render work that no human has read yet.",
  "",
  "`status` is `awaiting_review` when the drafts were written, or `failed` when the model could not produce schema-valid output twice running, when it declined the request or ran out of output tokens mid-answer (neither is retried — a second identical call ends the same way, so the job names the stop instead), when the provider errored, or when the write was refused. **A failed job is not an error response** — the row exists either way, holding both verbatim attempts and the tokens they cost, which is what makes a bad generation diagnosable (FR-AI-08). Expect `202` in both cases and branch on `status`.",
  "",
  "**The lesson has two titles.** `Lesson.title` and the slug come from the focus line — the name this CMS lists. `LessonTranslation.title` is what a child reads on a lesson card and is generated per requested locale, because an English focus line copied into the Bangla row is untranslated child-facing text that looks filled in (FR-I18N-01).",
  "",
  "**One grade, not a set.** The prompt writes for a reading age, so asking for Nursery and KG-2 at once is a request for two lessons. The created row still carries a `gradeLevels` array holding exactly the one grade asked for.",
  "",
  "**`languages` decides the contract the model is held to.** The requested locales become required keys on `title`, `introScript` and `narrationScript`, and a response missing one is rejected and retried once with the validation errors fed back. Quiz questions are the exception: the stored payload schema requires *both* locales on every question regardless, because a question is content and that contract predates this endpoint (FR-I18N-01). Duplicates are a `400`; the rule is a Zod refinement and therefore invisible in the schema below.",
  "",
  "**`worldId` is optional and inherited when omitted** — from the topic's first existing lesson, which is the normal case and not worth a second question. A topic with no lessons yet is a `409` rather than a default: a lesson themed into the wrong world is wrong on a child's home screen, and there is no safe guess.",
  "",
  "**Every asset URL in the generated quiz is a placeholder** on a reserved `.invalid` host. A text model cannot record narration or draw an illustration, and the server rewrites whatever it produced onto that host before storing it, so a plausible-looking CDN address cannot reach a row. File 36's voice and image pipelines replace them.",
].join("\n");

export const ADMIN_AI_ROUTES: RouteDoc[] = [
  {
    method: "post",
    path: "/api/admin/ai/generate/lesson",
    operation: {
      tags: ["Admin AI"],
      summary: "Generate a draft lesson",
      description: GENERATE_LESSON_DESCRIPTION,
      requestBody: jsonRequestBody("AiGenerateLessonBody"),
      responses: {
        "202": jsonResponse(
          'The job. `status: "awaiting_review"` means the drafts exist and are waiting for a human; `status: "failed"` means they do not, and the job row holds both attempts.',
          "GenerationJobRefResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": ADMIN_FORBIDDEN_RESPONSE,
        "404": errorResponse(
          "No such topic, or no such world when `worldId` was given.",
          ["NOT_FOUND"],
        ),
        "409": errorResponse(
          "The topic does not belong to the named subject, or `worldId` was omitted for a topic that has no lessons to inherit one from.",
          ["CONFLICT"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
