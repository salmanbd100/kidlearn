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
 * `routes/admin/ai.ts` — the AI generation pipeline (files 34–36, FR-AI-01..06,
 * FR-AI-08, FR-AI-09).
 *
 * The three text operations answer with the same `GenerationJobRefResponse`, and
 * every one of them can answer `202` with `status: "failed"`. That is not an
 * oversight in the status codes: a generation that produced nothing usable is not
 * a bad request, the job row exists and holds both attempts, and a client's next
 * step — open the job — is the same either way.
 *
 * The two media operations added by file 36 answer with `BatchGenerationRefResponse`
 * instead, because one click there creates *n* jobs — one per clip or picture,
 * since one clip is what a reviewer approves. They report `skipped` and `failed`
 * alongside: the first so a re-run on finished work reads as "nothing left to do"
 * rather than as five silent failures, the second so a batch that generated
 * nothing usable does not read as one that worked.
 *
 * **Every operation here can answer `429`.** Three independent daily ceilings —
 * text, audio, image — counted from `AIGenerationJob` rows created since midnight
 * in `APP_TIMEZONE`. They exist because the batch endpoints turn one click into
 * many provider calls; see `RATE_LIMITED_RESPONSE` below.
 */

const ADMIN_FORBIDDEN_RESPONSE = errorResponse(
  "Authenticated, but not an administrator. Every signed-in *parent* lands here — see `GET /api/admin/me` for why a valid session is not enough.",
  ["FORBIDDEN"],
);

/**
 * The `429` every generation operation shares (file 36).
 *
 * Deployment-wide rather than per administrator: what is being protected is a
 * shared free tier, so a second admin's budget is the same budget.
 */
const RATE_LIMITED_RESPONSE = errorResponse(
  [
    'Today\'s generation cap for this operation\'s cost bucket is used up. `error.details` carries `{ bucket, cap, used, pending }` — the arithmetic, not just the verdict, so a client can say "40 of 50 used, this needs 16" rather than "try again tomorrow".',
    "",
    "**Three independent ceilings, not one budget.** `text` covers the lesson, story and quiz operations; `audio` covers narration; `image` covers illustrations. The three cost wildly different amounts per call, and one shared ceiling would let a morning of narration work block the afternoon's lesson writing. Defaults are 50 / 200 / 100 per day (`AI_TEXT_JOBS_PER_DAY`, `AI_AUDIO_JOBS_PER_DAY`, `AI_IMAGE_JOBS_PER_DAY`).",
    "",
    "**The day is the calendar day in the deployment's `APP_TIMEZONE`** — the same day the reward grant and the streak roll-over use — so the counter resets at *local* midnight, not UTC.",
    "",
    "**A batch is refused whole rather than started and truncated.** Sixteen clips with three left in the budget is not thirteen clips of progress; it is a story narrated on five pages and silent on three, which has already been paid for and still has to be finished tomorrow.",
    "",
    "Counted deployment-wide, not per administrator: the free tier being protected is shared.",
  ].join("\n"),
  ["RATE_LIMITED"],
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

const GENERATE_STORY_DESCRIPTION = [
  "Writes a complete draft illustrated story — a per-locale title and moral, reusable character descriptions, and 6–8 ordered pages each carrying per-locale text and an English illustration prompt — from a set of grade levels, a moral to teach, a world and the languages (FR-AI-02).",
  "",
  "**Nothing this endpoint creates is visible to a child, and that is structural rather than a policy.** The `Story` row takes the `draft` default on its `status` column and carries the creating job's id; the student library filters `status = published`, so a generated story answers `404` to a learner until an administrator has moved it through review (FR-AI-07). No code path behind this operation can write any other status.",
  "",
  "**`202`, not `201`**, and `status` is `awaiting_review` or `failed` — see the lesson operation above for both, which behave identically here.",
  "",
  "**The story has two titles and two morals.** `Story.title` and `Story.slug` come from the generated English title (or the `theme` line when English was not requested — a Bangla title reduces to an unreadable slug); `Story.theme` keeps the admin's own words as the internal label. `StoryTranslation.title` and `.moral` are what a child reads and hears and are generated per requested locale, because an English sentence in the Bangla row is untranslated child-facing text that looks filled in (FR-I18N-01).",
  "",
  "**Grade levels are a set here, unlike the lesson generator's single grade.** A story is read aloud to whoever is listening and the reading age shapes sentence length rather than the story; a lesson teaches to one level.",
  "",
  "**`characterDescriptions` is generated but not stored as rows.** It lives in the job's `rawOutput`, where file 36's image pipeline reads it so the same rabbit is drawn on every page, and file 37 promotes it into `CharacterSheet` rows on approval. Creating character records for a story that may be rejected would leave orphans behind.",
  "",
  "**Two rules are Zod refinements and therefore invisible in the schema below**, and both are retried once with the validation errors fed back: page numbers must be exactly `1..pageCount` with no gaps or repeats (they become the unique `sortOrder`), and every `illustrationPrompt` must name at least one declared character (a prompt saying 'a small animal' cannot be drawn consistently). `gradeLevels` and `languages` must not repeat — that one is a `400`.",
].join("\n");

const GENERATE_QUIZ_DESCRIPTION = [
  "Writes 3–5 draft quiz questions for an existing lesson, spread across at least three of the four formats and validated against the shared `QuizQuestion` payload contract (FR-AI-03).",
  "",
  "**The prompt is grounded in what the lesson taught, not in its title.** Where the lesson itself came from a generation, its learning objectives and narration script are read back out of that job's audit record — the actual teaching text. Otherwise the lesson's intro scripts are the only record of its content the schema holds, and the prompt says so, so the model does not invent material a child was never shown.",
  "",
  '**A published quiz is refused with `409` `CONFLICT` (`details.code = "QUIZ_PUBLISHED"`), and no job row is created.** A `QuizQuestion` has no `status` of its own — its visibility is entirely its parent `Quiz`\'s — so appending a generated question to a published quiz would put unreviewed content in front of a child the instant the row landed, with no draft state to hold it and no transition for a reviewer to refuse (FR-AI-07). Withdraw the quiz to `draft` first (`POST /api/admin/content/quizzes/{id}/transition`). The check runs before the generation, so a refused request bills nothing.',
  "",
  "**The same check runs again inside the write transaction**, because generation is awaited inline and takes tens of seconds — long enough for somebody else to publish the quiz meanwhile. Then the questions are not written, the job is failed with the reason in its audit record, and the `409` carries `details.jobId` so what the model produced can still be read.",
  "",
  "**A lesson with no quiz gets one**, created as a draft in the same transaction and wired to the lesson. Questions are appended after the current maximum `sortOrder` rather than numbered from one, so hand-written questions keep their place and `@@unique([quizId, sortOrder])` cannot collide.",
  "",
  "**Both locales, always.** Unlike the lesson and story generators, `languages` does not narrow the stored content: the payload contract requires `prompt` and `promptAudio` in both locales on every question, because a question is content and that contract predates this endpoint (FR-I18N-01). What `languages` steers is the prompt's emphasis. Duplicates are a `400`.",
  "",
  "**Every image and audio URL is a placeholder** on the reserved `https://placeholder.kidlearn.invalid` host — a text model can neither draw nor record, and the server rewrites whatever it produced onto that host before storing it, so a plausible-looking CDN address cannot reach a row. File 36 replaces them, and file 37 refuses to approve a question that still holds one.",
  "",
  "**Exactly `count` questions using at least three distinct formats** — both Zod refinements, invisible below, retried once with the errors fed back.",
].join("\n");

const GENERATE_NARRATION_DESCRIPTION = [
  "Records the **missing** narration for one lesson, story or quiz, one job per `(target, locale)` pair (FR-AI-04, FR-I18N-05).",
  "",
  "**What counts as missing is the absence of a foreign key**, not a flag: `LessonTranslation.introAudioAssetId`, `StoryPageTranslation.narrationAudioAssetId`, `QuizQuestionTranslation.audioAssetId`. So re-running this on a half-narrated story asks for the half that is silent and nothing else, and running it on finished work creates no jobs at all.",
  "",
  '**The body carries no language, deliberately.** The locales are computed from what actually has text and no audio, so a caller cannot ask for a Bangla clip on a page with no Bangla text, nor re-record an existing clip by naming its language. Anything narrower than "the missing narration" is a way to produce a story that is half narrated and looks finished.',
  "",
  "**The foreign key is NOT set here, and that is the whole design.** Each job records the clip, a `MediaAsset` row carrying `aiJobId`, and which `(targetTable, targetId, locale)` it was recorded *for* — then stops on `awaiting_review`. An administrator listens first; the attachment happens on approval in file 37 (FR-CMS-05, FR-AI-07). Until then no student query can reach the audio, because nothing points at it. Setting the key at generation time would put an unreviewed voice — possibly the wrong voice for the language — into a lesson a five-year-old plays.",
  "",
  "**`targetId` is the id on the *parent* side of the translation row's unique key** — the lesson, the story page, the question — not the translation row's own id. `(targetId, locale)` is `@@unique([lessonId, language])` and its two siblings, so the pair addresses the row whether or not it exists yet. It does not always: a `QuizQuestionTranslation` is created only when a question gains audio.",
  "",
  "**One job per clip, not one per batch**, because one clip is what a reviewer approves. A single job covering sixteen clips could only be approved wholesale, and one bad take would send fifteen good ones back through the model.",
  "",
  "**A pair whose clip is already in the review queue is skipped too.** Its foreign key is still null, but generating a second clip would bill twice and hand the reviewer two takes when they asked for one. Jobs that `failed` or were `rejected` do not block a retry — neither left a usable clip.",
  "",
  "**Each narration asset carries `language` = its own locale** (FR-I18N-05). An asset with a null language is a clip nobody can tell the language of, and a Bangla learner could be served the English one.",
  "",
  "**Where the words come from, per entity.** `lesson`: `LessonTranslation.introScript`. `story`: each `StoryPageTranslation.text`, pages in reading order. `quiz`: each question's `definition.prompt[locale]` — the JSONB payload, since `QuizQuestionTranslation` holds an audio key and nothing else.",
  "",
  "`202` with an empty `jobIds` and a non-zero `skipped` is the ordinary result of re-running the action; nothing was wrong with the request.",
].join("\n");

const GENERATE_ILLUSTRATIONS_DESCRIPTION = [
  "Draws the missing illustrations for one story, one job per page (FR-AI-05), with recurring characters held stable by `CharacterSheet` rows (FR-AI-09).",
  "",
  'A page is a candidate when it carries an `illustrationPrompt` — the English scene brief `POST /generate/story` wrote — and has no `illustrationAssetId` yet. A hand-authored page with no brief is not a candidate at all rather than a skipped one: there is nothing to draw from, so counting it as "already had a picture" would say something untrue.',
  "",
  "**Every prompt in a batch carries the same character block, and that is the point.** The applicable sheets are read once per story and prepended verbatim to every page, so page 3's rabbit and page 7's rabbit are described to the model in identical words. An image model is stateless — it remembers nothing about the picture it drew a second ago — so this repetition *is* the consistency mechanism. Selecting sheets per page, by which characters a brief happens to name, was the alternative and is worse: a brief saying \"the rabbit finds a carrot\" without naming Nibbles would silently lose its sheet and come back as a different rabbit.",
  "",
  "**The applicable sheets are the story world's plus the world-less ones**, ordered world-scoped first then by slug. The order is fixed rather than left to the database because two prompts differing only in the order of two descriptions is a difference an image model can act on. `GET /api/admin/content/character-sheets?worldId=` returns exactly this set.",
  "",
  "**A fixed style prefix comes first in every prompt** — soft rounded cartoon, bright colours, thick outlines, friendly expressions, **no text in the image**. The last of those is load-bearing: an image model asked for a classroom will render a blackboard of misspelled pseudo-English, which for a child learning to read is worse than no picture. Every word a child sees comes from a translation row instead, so it can be translated and narrated (FR-I18N-01).",
  "",
  "**The foreign key is NOT set here.** Same rule as narration: the `MediaAsset` row carries `aiJobId`, the job records which `StoryPage` it was drawn for, and `StoryPage.illustrationAssetId` is written on approval in file 37 (FR-CMS-05, FR-AI-07). `illustrationPrompt` is kept afterwards, so a page can be redrawn.",
  "",
  "**Illustration assets carry `language: null`.** A picture has no language, and stamping one would hide it from the other locale's media filter.",
  "",
  "The job's `input` holds the **resolved** prompt verbatim, not the brief plus a note that sheets were applied: a reviewer looking at a rabbit that came back wrong needs the words the model actually saw, and the sheet may have been edited since (FR-AI-08).",
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
        "429": RATE_LIMITED_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/admin/ai/generate/story",
    operation: {
      tags: ["Admin AI"],
      summary: "Generate a draft story",
      description: GENERATE_STORY_DESCRIPTION,
      requestBody: jsonRequestBody("AiGenerateStoryBody"),
      responses: {
        "202": jsonResponse(
          'The job. `status: "awaiting_review"` means the draft story and its pages exist and are waiting for a human; `status: "failed"` means they do not, and the job row holds both attempts.',
          "GenerationJobRefResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": ADMIN_FORBIDDEN_RESPONSE,
        "404": errorResponse("No such world.", ["NOT_FOUND"]),
        "429": RATE_LIMITED_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/admin/ai/generate/quiz",
    operation: {
      tags: ["Admin AI"],
      summary: "Generate draft quiz questions for a lesson",
      description: GENERATE_QUIZ_DESCRIPTION,
      requestBody: jsonRequestBody("AiGenerateQuizBody"),
      responses: {
        "202": jsonResponse(
          'The job. `status: "awaiting_review"` means the draft questions exist and are waiting for a human; `status: "failed"` means they do not, and the job row holds both attempts.',
          "GenerationJobRefResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": ADMIN_FORBIDDEN_RESPONSE,
        "404": errorResponse("No such lesson.", ["NOT_FOUND"]),
        "409": errorResponse(
          "The lesson's quiz is `published`, so a generated question would be live the moment it was written. `details.code` is `QUIZ_PUBLISHED`; withdraw the quiz to `draft` and try again. Refused before the generation, so no job row is created — unless the quiz was published *during* it, in which case the write is refused instead, nothing is appended, and `details.jobId` names the failed job holding what the model wrote.",
          ["CONFLICT"],
        ),
        "429": RATE_LIMITED_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/admin/ai/generate/narration",
    operation: {
      tags: ["Admin AI"],
      summary: "Record the missing narration for a lesson, story or quiz",
      description: GENERATE_NARRATION_DESCRIPTION,
      requestBody: jsonRequestBody("AiGenerateNarrationBody"),
      responses: {
        "202": jsonResponse(
          "`jobIds` is one job per clip started; `skipped` counts pairs that already had audio, already had a clip in the queue, or had no text to read; `failed` counts how many of `jobIds` produced nothing usable. All three may be zero.\n\n**`failed` is why a batch cannot be read from `jobIds` alone.** The single-job operations answer with a `status`; a batch has one per job, and without this count a revoked provider key on a sixteen-clip story is indistinguishable from sixteen clips recorded. The failed jobs are still listed — they exist and hold their own error — and are the ones to open first.",
          "BatchGenerationRefResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": ADMIN_FORBIDDEN_RESPONSE,
        "404": errorResponse("No lesson, story or quiz with that id.", [
          "NOT_FOUND",
        ]),
        "429": RATE_LIMITED_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/admin/ai/generate/illustrations",
    operation: {
      tags: ["Admin AI"],
      summary: "Draw the missing illustrations for a story",
      description: GENERATE_ILLUSTRATIONS_DESCRIPTION,
      requestBody: jsonRequestBody("AiGenerateIllustrationsBody"),
      responses: {
        "202": jsonResponse(
          "`jobIds` is one job per page started; `skipped` counts pages that already had an illustration or already had one in the queue; `failed` counts how many of `jobIds` produced no picture. See the narration operation for why a batch reports `failed` separately.",
          "BatchGenerationRefResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": ADMIN_FORBIDDEN_RESPONSE,
        "404": errorResponse("No story with that id.", ["NOT_FOUND"]),
        "429": RATE_LIMITED_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
