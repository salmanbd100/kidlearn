import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
  VALIDATION_RESPONSE,
} from "../components.js";
import { pathParam, type RouteDoc } from "../route-doc.js";

/**
 * `routes/content.ts` — mounted behind `requireParent` **and**
 * `requireActiveChild` in `routes/index.ts` rather than inside the route file, so
 * that every present and future `/api/content/*` path is covered by construction.
 */

const NO_ACTIVE_CHILD_RESPONSE = errorResponse(
  "No active child profile on this session. Call `POST /api/children/{id}/activate` first — there is no grade or language to filter by until then. Also returned when the session's active profile belongs to another parent, or has since been deleted.",
  ["FORBIDDEN"],
);

/**
 * The shared preamble on every operation in this tag. Repeated per operation
 * rather than stated once at the tag level because Swagger UI collapses tag
 * descriptions and a reader landing on one endpoint would miss it.
 */
const FILTERED = [
  "Filtered to `status = published` and the active child's `gradeLevel`, with text resolved to their `preferredLanguage` (falling back to English).",
  "",
  "Grade and language come **only** from the server-side child record — this API accepts no query parameters at all, so `?gradeLevel=KG2` changes nothing (FR-PROF-03).",
].join("\n");

const CONTENT_ID_PARAM = (subject: string) =>
  pathParam(`id`, `The ${subject} id. Must be a uuid.`, {
    type: "string",
    format: "uuid",
  });

/** Unpublished and wrong-grade both answer 404, and for the same reason. */
const contentNotFound = (what: string) =>
  errorResponse(
    `No such ${what}, **or** it is not published, **or** it is not tagged for this child's grade. All three are the same \`404\`: a \`403\` would confirm the row exists, and draft content must not be discoverable by probing (spec §7.3.4).`,
    ["NOT_FOUND"],
  );

export const CONTENT_ROUTES: RouteDoc[] = [
  {
    method: "get",
    path: "/api/content/worlds",
    operation: {
      tags: ["Content"],
      summary: "List published worlds",
      description: [
        "The themed worlds the home screen renders (FR-WORLD-01..03, FR-WORLD-05).",
        "",
        "`palette` and `mascot` are what make theming data-driven: the client reads its tokens from the response rather than hard-coding a world's colours.",
        "",
        "Worlds carry no grade tagging of their own — only the published filter applies here. Lessons are the grade-tagged rows.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "Published worlds, ordered by slug.",
          "WorldListResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/content/worlds/{id}/lessons",
    operation: {
      tags: ["Content"],
      summary: "List a world's lessons, grouped by topic",
      description: [
        `Everything the child can do inside one world — the world screen's only request. ${FILTERED}`,
        "",
        "`World` and `Topic` are orthogonal: a lesson has one topic (its curriculum position, authored subject → topic → lesson) and one world (its setting). Navigating by world therefore crosses the subject tree sideways, which is why this endpoint exists rather than the client walking `/subjects → /topics → /lessons` and keeping the rows whose `worldId` matched — that client would be deciding content visibility for itself.",
        "",
        "Three status and grade gates apply, not one: the lesson's own, its topic's, and its subject's. A lesson tagged for this child can still sit under a topic tagged for another grade or a subject still in draft, and in both cases its curriculum position says it is not for this child.",
        "",
        "Topics are ordered by `sortOrder`, lessons by `sortOrder` within each. A topic with no visible lesson in this world is absent entirely — there are no empty sections.",
      ].join("\n"),
      parameters: [CONTENT_ID_PARAM("world")],
      responses: {
        "200": jsonResponse(
          "Topic sections, each with its lessons. Empty when the world is published but holds nothing for this child's grade.",
          "WorldLessonsResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        // Not `contentNotFound`: worlds carry no grade tagging, so only two of
        // its three causes can apply here.
        "404": errorResponse(
          "No such world, **or** it is not published. Both are the same `404`, for the same reason as everywhere else in this tag: a `403` would confirm the row exists. A *published* world holding nothing for this child's grade is not a 404 — it answers `200` with an empty `topics` array.",
          ["NOT_FOUND"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/content/subjects",
    operation: {
      tags: ["Content"],
      summary: "List subjects that have content for this child",
      description: [
        `Subjects with at least one published lesson for the child's grade (FR-CURR-01). ${FILTERED}`,
        "",
        "The existence check is the point: a subject whose every lesson is still in draft is omitted, so the home screen never renders a tile that opens onto nothing.",
        "",
        "`iconAsset` is a reserved field and is always `null` — the settled schema has no such column.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "Non-empty subjects, ordered by `sortOrder`.",
          "SubjectListResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/content/subjects/{id}/topics",
    operation: {
      tags: ["Content"],
      summary: "List a subject's topics",
      description: `Topics of the subject that have at least one matching lesson. ${FILTERED}`,
      parameters: [CONTENT_ID_PARAM("subject")],
      responses: {
        "200": jsonResponse(
          "Topics, ordered by `sortOrder`.",
          "TopicListResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "404": contentNotFound("subject"),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/content/topics/{id}/lessons",
    operation: {
      tags: ["Content"],
      summary: "List a topic's lessons",
      description: [
        `Lessons of the topic, as list tiles. ${FILTERED}`,
        "",
        "A lesson in an unpublished world is omitted here as well as from the detail endpoint, so the two agree: a tile that appears must open.",
        "",
        "`thumbnailUrl`, `durationEstimateSec`, `nameAudioUrl` and `progress` are reserved fields, always `null`. `nameAudioUrl` is where the voice pipeline (file 36) attaches the child's-locale reading of `title`. `progress` stays reserved: file 16 shipped `GET /api/progress/lessons/{id}` rather than a per-lesson join, so that a tile's progress and the player's resume point cannot disagree by being read from two places.",
      ].join("\n"),
      parameters: [CONTENT_ID_PARAM("topic")],
      responses: {
        "200": jsonResponse(
          "Lessons, ordered by `sortOrder`.",
          "LessonListResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "404": contentNotFound("topic"),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/content/lessons/{id}",
    operation: {
      tags: ["Content"],
      summary: "Get a full lesson for the player",
      description: [
        `Everything the lesson player needs in one round trip. ${FILTERED}`,
        "",
        "`introScript`, `introAudioUrl`, `videoUrl` and `videoPosterUrl` are resolved to a single locale, and `locale` reports which one supplied `introScript`. The URLs fall back to English independently of it, so a Bangla intro script with an English video is a normal response.",
        "",
        "`assetFallbacks` names which of those URLs were substituted from English. It is **reporting only** — every URL is already resolved, so a client that ignored the object entirely would play identical media. The player attaches it to its `step_complete` event so the content gap is countable. A flag is `true` only where an English asset actually replaced a missing one; a lesson with no video in either locale reads `false`, because that is a recording that was never made rather than a translation that is missing.",
        "",
        "`activity.definition` and each `quiz.questions[].definition` are the versioned JSONB payloads, passed through **whole** — see the `ActivityDefinition` and `QuizQuestion` schemas. They are the one exception to locale resolution: they embed `LocalizedText`, and the engines pick the locale themselves via `@kidlearn/types`.",
        "",
        "`activity` or `quiz` is `null` when the lesson has none, **and also** when it references one that is not itself published. A published lesson whose activity is still in review is a normal state of the authoring workflow: the activity is omitted and logged, not served, and not treated as an error.",
        "",
        "### Administrator preview (`?preview=1`, FR-CMS-04)",
        "",
        "With `preview=1` **and a session an `AdminUser` row backs**, the `status` and grade filters are skipped, and unpublished activities and quizzes are included rather than omitted — a reviewer looking at a lesson whose activity is still in review needs to see the activity. The response shape is identical, which is the point: the CMS mounts the real student player against it.",
        "",
        "**The parameter requests the mode; the session grants it.** Sent by a child, a parent, or nobody at all, it is ignored entirely and a draft lesson still answers `404`. Preview also takes `lang`, because there is no child row to read a locale from.",
        "",
        "Nothing is written in preview. Every endpoint that records progress, an event or screen time is behind the parent and active-child guards, which an admin session cannot pass at all.",
      ].join("\n"),
      parameters: [
        CONTENT_ID_PARAM("lesson"),
        {
          name: "preview",
          in: "query",
          required: false,
          description:
            "`1` to request administrator preview. Ignored unless the session belongs to an administrator — see the description above.",
          schema: { type: "string", enum: ["1"] },
        },
        {
          name: "lang",
          in: "query",
          required: false,
          description:
            "Which locale to render an administrator preview in. Ignored outside preview, where the locale comes from the child's profile. An unrecognised value previews in English rather than failing.",
          schema: { type: "string", enum: ["en", "bn"] },
        },
      ],
      responses: {
        "200": jsonResponse(
          "The lesson, its world, and its activity and quiz payloads.",
          "LessonDetailResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "404": contentNotFound("lesson"),
        "423": errorResponse(
          "The parental screen-time gate is shut (FR-TIME-02..04). `TIME_LIMIT_REACHED` — today's allowance is used up; `OUTSIDE_WINDOW` — the clock is outside the access window the parent set, and `error.details.windowStart` is the time to come back at. `error.details` also carries `minutesToday` and `dailyLimitMinutes`.\n\n**A lesson already under way is exempt** (FR-TIME-03): if this child has a `LessonProgress` row for *this* lesson with no `completedAt` that was last written within the past 30 minutes, the gate is skipped and the lesson is served, even across a refresh. Replaying a lesson that was already finished counts as a new start and is gated like one, and so does resuming one abandoned longer ago than that — the exemption is for the child who is mid-lesson now, not a standing pass earned by half-starting something.\n\n`423` rather than `403` on purpose: the request is well-formed and the caller is who they say they are — the resource is unavailable for a reason that passes on its own, and a `403` would be indistinguishable from the PIN gate's. `POST /api/progress/lessons/{id}/step` is never gated, so a lesson in progress can always be finished.",
          ["TIME_LIMIT_REACHED", "OUTSIDE_WINDOW"],
        ),
        "500": errorResponse(
          "Either an unexpected error, or a **published** activity or quiz question whose JSONB fails validation against `@kidlearn/types`. The latter is a server-side content bug rather than a client error, so it is logged with the offending row id and answered with a fixed message carrying no part of the payload.",
          ["INTERNAL"],
        ),
      },
    },
  },
];
