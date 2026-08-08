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
        "`thumbnailUrl`, `durationEstimateSec` and `progress` are reserved fields, always `null`. `progress` is where file 16 joins per-child `LessonProgress` without changing this contract.",
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
        "`introScript`, `introAudioUrl` and `videoUrl` are resolved to a single locale, and `locale` reports which one supplied `introScript`. The URLs fall back to English independently of it, so a Bangla intro script with an English video is a normal response.",
        "",
        "`activity.definition` and each `quiz.questions[].definition` are the versioned JSONB payloads, passed through **whole** — see the `ActivityDefinition` and `QuizQuestion` schemas. They are the one exception to locale resolution: they embed `LocalizedText`, and the engines pick the locale themselves via `@kidlearn/types`.",
        "",
        "`activity` or `quiz` is `null` when the lesson has none, **and also** when it references one that is not itself published. A published lesson whose activity is still in review is a normal state of the authoring workflow: the activity is omitted and logged, not served, and not treated as an error.",
      ].join("\n"),
      parameters: [CONTENT_ID_PARAM("lesson")],
      responses: {
        "200": jsonResponse(
          "The lesson, its world, and its activity and quiz payloads.",
          "LessonDetailResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "404": contentNotFound("lesson"),
        "500": errorResponse(
          "Either an unexpected error, or a **published** activity or quiz question whose JSONB fails validation against `@kidlearn/types`. The latter is a server-side content bug rather than a client error, so it is logged with the offending row id and answered with a fixed message carrying no part of the payload.",
          ["INTERNAL"],
        ),
      },
    },
  },
];
