import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonRequestBody,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
  VALIDATION_RESPONSE,
} from "../components.js";
import { pathParam, type RouteDoc } from "../route-doc.js";

/**
 * `routes/admin/content-editors.ts` — the guided editors (file 33, FR-CMS-03,
 * FR-GAM-04).
 *
 * Written out per operation rather than generated from a table, unlike
 * `paths/admin-content.ts`. The four curriculum resources really are the same
 * five operations with different schemas; these three are not — a quiz owns an
 * ordered sub-resource, an activity is a single payload, and a badge is a rule.
 * A generator over them would be a table of exceptions.
 */

const ADMIN_FORBIDDEN_RESPONSE = errorResponse(
  "Authenticated, but not an administrator. Every signed-in *parent* lands here — see `GET /api/admin/me` for why a valid session is not enough.",
  ["FORBIDDEN"],
);

const GUARD_RESPONSES = {
  "401": UNAUTHORIZED_RESPONSE,
  "403": ADMIN_FORBIDDEN_RESPONSE,
  "500": INTERNAL_RESPONSE,
};

const NOT_FOUND_RESPONSE = errorResponse(
  "No row with that id. A plain `404` carrying no content-safety subtlety: an admin is authorised to know what exists.",
  ["NOT_FOUND"],
);

/**
 * Why the request body cannot show the payload shape inline, and where to look
 * instead.
 */
function definitionNote(schemaName: string, discriminator: string): string {
  return [
    `\`definition\` is the versioned JSONB payload — see the **${schemaName}** schema for the full union. It is typed as an untyped value in the request body below, and that is deliberate rather than a gap:`,
    "",
    `the server parses it with the *specific* member of that union which \`${discriminator}\` names, not with the union itself. Zod reports a failed union as one root-level issue, which flattens to \`definition: ["Invalid input"]\` and tells an author nothing; parsing against the named member yields \`definition.prompt.bn: Required\` — the field that is actually wrong. It also makes the agreement check structural: the member carries \`type\` as a literal, so a payload of the wrong shape fails on it.`,
    "",
    `So \`${discriminator}\` and \`definition.type\` **must** name the same thing. They are two columns' worth of one fact — the enum column is what the student API picks a renderer from, and the payload is what it hands that renderer — and a row where they disagree makes the student endpoint answer \`500\`. This is where that is prevented.`,
  ].join("\n");
}

const EDIT_CONFLICT_RESPONSE = errorResponse(
  [
    'The row is `published` (`code: "EDIT_REQUIRES_UNPUBLISH"`, with `status` and `allowed`).',
    "",
    "**A published row refuses an edit.** The transition matrix guards the act of publishing, not the content that stays published afterwards, so without this a `PATCH` could rewrite a live quiz question and reach a child without passing a reviewer again. Withdraw first — `published → draft` — then edit, then come back through `draft → in_review → approved → published`.",
  ].join("\n"),
  ["CONFLICT"],
);

const TRANSITION_MATRIX = [
  "| From | May become |",
  "|---|---|",
  "| `draft` | `in_review`, `archived` |",
  "| `in_review` | `approved`, `rejected`, `draft` (withdraw) |",
  "| `approved` | `published`, `draft` (reopen) |",
  "| `rejected` | `draft` (rework), `archived` |",
  "| `published` | `draft` (unpublish), `archived` |",
  "| `archived` | `draft` (restore) |",
].join("\n");

function transitionDescription(kind: string, effect: string): string {
  return [
    `Moves one ${kind} through the publishing workflow (FR-CMS-06). **The only way its \`status\` changes** — no create or edit body here carries a \`status\` key.`,
    "",
    TRANSITION_MATRIX,
    "",
    "`published` is reachable from `approved` and nowhere else, so nothing skips a reviewer; `rejected` leads only back to `draft` or `archived`, so a rejection cannot be undone; and the diagonal is empty, because a no-op transition would leave an audit trail claiming a review step nobody performed.",
    "",
    effect,
  ].join("\n");
}

const ACTIVITY_PUBLISH_EFFECT =
  "**Publishing matters in its own right.** `GET /api/content/lessons/{id}` gates `Lesson.activity` on the activity's own `status`, so a published lesson renders no activity step until the activity is published too — and unpublishing one removes it from a live lesson without taking the lesson down.";

const QUIZ_PUBLISH_EFFECT =
  "**Publishing matters in its own right.** `GET /api/content/lessons/{id}` gates `Lesson.quiz` on the quiz's own `status`, so a published lesson renders no quiz step until the quiz is published too. The questions have no status of their own — a quiz publishes as a whole, which is also why a published quiz refuses question edits.";

const BADGE_PUBLISH_EFFECT =
  "**Publishing is what makes a badge earnable.** The achievement engine (file 24) evaluates published badges against a child's totals after every completion, so a `draft` badge is authored but inert, and archiving one stops it being awarded without deleting the `RewardLedger` rows that recorded it.";

const CONFLICT_RESPONSE = errorResponse(
  [
    'The hop is not in the matrix. `error.details` carries `code: "INVALID_TRANSITION"`, the `from` and `to` that were refused, and `allowed` — the legal next states — so a client can refresh its buttons from the rejection rather than guessing.',
    "",
    "`409` rather than `400`: the request is well formed and the target status is a real one. What is wrong is the state the row happens to be in, which may not be wrong a moment later.",
  ].join("\n"),
  ["CONFLICT"],
);

const INCLUDE_ARCHIVED_PARAM = {
  name: "includeArchived",
  in: "query",
  required: false,
  description:
    "`true` to include archived rows, which are hidden by default. Archiving is how content is retired, and a list that showed every retirement forever is a list an admin stops reading.",
  schema: { type: "string", enum: ["true", "false"] },
};

const quizId = pathParam("quizId", "The quiz's id.", {
  type: "string",
  format: "uuid",
});

export const ADMIN_EDITOR_ROUTES: RouteDoc[] = [
  // --- Quizzes -----------------------------------------------------------
  {
    method: "post",
    path: "/api/admin/content/quizzes",
    operation: {
      tags: ["Admin CMS"],
      summary: "Create a quiz",
      description: [
        "Creates an empty quiz as **`draft`**, ready for questions.",
        "",
        "A quiz container carries almost nothing. `title` is an internal label and is nullable, because an untitled quiz attached to one lesson is ordinary; the child-facing copy lives inside each question's payload, in both locales, because the engine that renders it does its own locale picking.",
        "",
        "A lesson points at a quiz through `Lesson.quizId`, set with `PATCH /api/admin/content/lessons/{id}`.",
      ].join("\n"),
      requestBody: jsonRequestBody("AdminQuizCreateBody"),
      responses: {
        "201": jsonResponse(
          "The created quiz, status `draft`, `questionCount` 0.",
          "AdminQuizResponse",
        ),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
      },
    },
  },
  {
    method: "get",
    path: "/api/admin/content/quizzes",
    operation: {
      tags: ["Admin CMS"],
      summary: "List quizzes",
      description: [
        "Every quiz, newest first, with the number of questions each holds — so a list needs no second request per row.",
        "",
        "**Unfiltered by status, deliberately**, like every list on this surface: it exists to show drafts. Archived rows are the one exception.",
      ].join("\n"),
      parameters: [INCLUDE_ARCHIVED_PARAM],
      responses: {
        "200": jsonResponse("Quizzes, newest first.", "AdminQuizListResponse"),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
      },
    },
  },
  {
    method: "get",
    path: "/api/admin/content/quizzes/{quizId}",
    operation: {
      tags: ["Admin CMS"],
      summary: "Read one quiz with its questions",
      description: [
        "One quiz and every question it holds, in `sortOrder` — the question editor's only read.",
        "",
        "Each `definition` is the stored JSONB, whatever its status: this is the authoring view, and a draft question is precisely what an author has opened the page to fix.",
      ].join("\n"),
      parameters: [quizId],
      responses: {
        "200": jsonResponse(
          "The quiz and its questions.",
          "AdminQuizDetailResponse",
        ),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
        "404": NOT_FOUND_RESPONSE,
      },
    },
  },
  {
    method: "patch",
    path: "/api/admin/content/quizzes/{quizId}",
    operation: {
      tags: ["Admin CMS"],
      summary: "Rename a quiz",
      description: [
        "`title` only — the questions are edited through their own operations, and `status` through the transition endpoint.",
        "",
        "At least one field is required; an empty body is a `400`. (Zod's refinement carrying that rule is dropped in JSON Schema conversion, so it is stated here rather than visible below.)",
      ].join("\n"),
      parameters: [quizId],
      requestBody: jsonRequestBody("AdminQuizUpdateBody"),
      responses: {
        "200": jsonResponse("The updated quiz.", "AdminQuizResponse"),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
        "404": NOT_FOUND_RESPONSE,
        "409": EDIT_CONFLICT_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/admin/content/quizzes/{quizId}/transition",
    operation: {
      tags: ["Admin CMS"],
      summary: "Change a quiz's status",
      description: transitionDescription("quiz", QUIZ_PUBLISH_EFFECT),
      parameters: [quizId],
      requestBody: jsonRequestBody(
        "ContentTransitionBody",
        "The target status. Whether the hop is legal from the row's current status is decided server-side.",
      ),
      responses: {
        "200": jsonResponse("The quiz at its new status.", "AdminQuizResponse"),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
        "404": NOT_FOUND_RESPONSE,
        "409": CONFLICT_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/admin/content/quizzes/{quizId}/questions",
    operation: {
      tags: ["Admin CMS"],
      summary: "Add a question to a quiz",
      description: [
        "Appends a question (FR-CMS-03). `sortOrder` is assigned server-side at the end of the list — it is not a field the caller supplies, for the same reason curriculum position is not.",
        "",
        definitionNote("QuizQuestion", "format"),
        "",
        "Every format carries `prompt` and `promptAudio` in **both** locales, because a three-year-old cannot read the question and it must always be speakable (FR-QUIZ-05). A missing `bn` prompt is a `400`, not a fallback.",
      ].join("\n"),
      parameters: [quizId],
      requestBody: jsonRequestBody("AdminQuizQuestionBody"),
      responses: {
        "201": jsonResponse(
          "The created question, with the `sortOrder` it was given.",
          "AdminQuizQuestionResponse",
        ),
        "400": errorResponse(
          "The body failed validation, **or** `definition` is not a valid payload for the `format` given. `error.details` carries flattened issues whose paths are prefixed `definition.…`, so a client can put each message under the input that produced it.",
          ["VALIDATION_FAILED"],
        ),
        ...GUARD_RESPONSES,
        "404": NOT_FOUND_RESPONSE,
        "409": EDIT_CONFLICT_RESPONSE,
      },
    },
  },
  {
    method: "patch",
    path: "/api/admin/content/quizzes/{quizId}/questions/{id}",
    operation: {
      tags: ["Admin CMS"],
      summary: "Replace a question",
      description: [
        "Replaces a question's `format` and `definition` **whole**. There is no partial edit and there should not be: a definition's parts cross-validate — `correctOptionId` has to name an option still in `options` — so merging a fragment into a stored payload would produce a shape neither the author nor the schema ever saw as a whole. The editor holds the entire form state anyway.",
        "",
        "`format` may change with the payload: turning an `mcq` into a `picture_select` is a legitimate authoring move, and the column follows the payload rather than pinning it.",
        "",
        "`sortOrder` is untouched — position is not part of a question's content.",
        "",
        "A question that does not belong to the quiz named in the path is a **`404`**, not a `403`: from this caller's point of view it does not exist under that quiz.",
        "",
        definitionNote("QuizQuestion", "format"),
      ].join("\n"),
      parameters: [
        quizId,
        pathParam("id", "The question's id.", {
          type: "string",
          format: "uuid",
        }),
      ],
      requestBody: jsonRequestBody("AdminQuizQuestionBody"),
      responses: {
        "200": jsonResponse(
          "The replaced question.",
          "AdminQuizQuestionResponse",
        ),
        "400": errorResponse(
          "The body failed validation, **or** `definition` is not a valid payload for the `format` given — see the create operation.",
          ["VALIDATION_FAILED"],
        ),
        ...GUARD_RESPONSES,
        "404": NOT_FOUND_RESPONSE,
        "409": EDIT_CONFLICT_RESPONSE,
      },
    },
  },
  {
    method: "delete",
    path: "/api/admin/content/quizzes/{quizId}/questions/{id}",
    operation: {
      tags: ["Admin CMS"],
      summary: "Remove a question",
      description: [
        "Deletes the question and **renumbers the survivors** to `0..n-1`.",
        "",
        "The renumbering is not cosmetic. `QuizQuestion` carries a unique index on `(quizId, sortOrder)` and the next question added derives its index from the count, so a hole left behind would make the next append collide with an existing row.",
        "",
        "That is also why this answers with a body rather than `204`: the client's list is stale the moment the delete succeeds, and `remainingIds` is what lets the editor settle on the server's order instead of guessing at it.",
        "",
        "A question that does not belong to the quiz named in the path is a `404`.",
      ].join("\n"),
      parameters: [
        quizId,
        pathParam("id", "The question's id.", {
          type: "string",
          format: "uuid",
        }),
      ],
      responses: {
        "200": jsonResponse(
          "The removed id, and the survivors in their renumbered order.",
          "QuestionDeletedResponse",
        ),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
        "404": NOT_FOUND_RESPONSE,
        "409": EDIT_CONFLICT_RESPONSE,
      },
    },
  },

  // --- Activities --------------------------------------------------------
  {
    method: "post",
    path: "/api/admin/content/activities",
    operation: {
      tags: ["Admin CMS"],
      summary: "Create an activity",
      description: [
        "Creates an activity as **`draft`** (FR-ACT-06). A lesson points at one through `Lesson.activityId`.",
        "",
        definitionNote("ActivityDefinition", "type"),
        "",
        "`schemaVersion` is read from the payload rather than supplied: the column and the JSONB must agree about which version of the shape was stored, and one of them being authoritative is what makes that true.",
      ].join("\n"),
      requestBody: jsonRequestBody("AdminActivityBody"),
      responses: {
        "201": jsonResponse(
          "The created activity, status `draft`.",
          "AdminActivityResponse",
        ),
        "400": errorResponse(
          "The body failed validation, **or** `definition` is not a valid payload for the `type` given. `error.details` carries flattened issues whose paths are prefixed `definition.…`.",
          ["VALIDATION_FAILED"],
        ),
        ...GUARD_RESPONSES,
      },
    },
  },
  {
    method: "get",
    path: "/api/admin/content/activities",
    operation: {
      tags: ["Admin CMS"],
      summary: "List activities",
      description:
        "Every activity, newest first, each with its whole `definition` — the payloads are small and the editor opens straight into one. Unfiltered by status apart from archived rows.",
      parameters: [
        INCLUDE_ARCHIVED_PARAM,
        {
          name: "type",
          in: "query",
          required: false,
          description: "Restrict to one activity type.",
          schema: {
            type: "string",
            enum: ["drag_drop", "trace", "match", "puzzle"],
          },
        },
      ],
      responses: {
        "200": jsonResponse(
          "Activities, newest first.",
          "AdminActivityListResponse",
        ),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
      },
    },
  },
  {
    method: "get",
    path: "/api/admin/content/activities/{id}",
    operation: {
      tags: ["Admin CMS"],
      summary: "Read one activity",
      description: "One activity and its payload, whatever its status.",
      parameters: [
        pathParam("id", "The activity's id.", {
          type: "string",
          format: "uuid",
        }),
      ],
      responses: {
        "200": jsonResponse("The activity.", "AdminActivityResponse"),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
        "404": NOT_FOUND_RESPONSE,
      },
    },
  },
  {
    method: "patch",
    path: "/api/admin/content/activities/{id}",
    operation: {
      tags: ["Admin CMS"],
      summary: "Replace an activity's payload",
      description: [
        "Replaces `type` and `definition` whole, for the reason a question replacement gives: a definition's parts cross-validate, so a fragment merged into a stored payload would produce a shape nothing ever validated as a whole.",
        "",
        definitionNote("ActivityDefinition", "type"),
      ].join("\n"),
      parameters: [
        pathParam("id", "The activity's id.", {
          type: "string",
          format: "uuid",
        }),
      ],
      requestBody: jsonRequestBody("AdminActivityBody"),
      responses: {
        "200": jsonResponse("The updated activity.", "AdminActivityResponse"),
        "400": errorResponse(
          "The body failed validation, **or** `definition` is not a valid payload for the `type` given — see the create operation.",
          ["VALIDATION_FAILED"],
        ),
        ...GUARD_RESPONSES,
        "404": NOT_FOUND_RESPONSE,
        "409": EDIT_CONFLICT_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/admin/content/activities/{id}/transition",
    operation: {
      tags: ["Admin CMS"],
      summary: "Change an activity's status",
      description: transitionDescription("activity", ACTIVITY_PUBLISH_EFFECT),
      parameters: [
        pathParam("id", "The activity's id.", {
          type: "string",
          format: "uuid",
        }),
      ],
      requestBody: jsonRequestBody("ContentTransitionBody"),
      responses: {
        "200": jsonResponse(
          "The activity at its new status.",
          "AdminActivityResponse",
        ),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
        "404": NOT_FOUND_RESPONSE,
        "409": CONFLICT_RESPONSE,
      },
    },
  },

  // --- Badges ------------------------------------------------------------
  {
    method: "post",
    path: "/api/admin/content/badges",
    operation: {
      tags: ["Admin CMS"],
      summary: "Create a badge",
      description: [
        "Creates a badge as **`draft`** (FR-GAM-04). **Badges are data, not code**: a row carries a `ruleType` and a `rule` payload that a server-side engine interprets, so a new milestone is this request rather than a deploy.",
        "",
        "`rule` is validated against the schema its `ruleType` names, and each of those is `.strict()` — so a `topicSlug` on a `streak_days` badge is a `400` naming the key, not a silently dropped parameter that would leave the badge evaluating against something nobody chose. What each type takes:",
        "",
        "| `ruleType` | `rule` |",
        "|---|---|",
        '| `lessons_completed_in_topic` | `{ topicSlug, count }` — `count` is a positive integer or the literal `"all"`, which means every *published* lesson in the topic, so the badge needs no re-authoring when the twenty-seventh letter lesson ships |',
        "| `stories_completed` | `{ count }` |",
        "| `streak_days` | `{ days }` — consecutive local days with at least one completion, in the deployment's `APP_TIMEZONE` |",
        "| `quiz_correct_in_topic` | `{ topicSlug, count }` — questions in the topic whose *latest* response was correct |",
        "",
        "Free-form JSON is deliberately not offered by the CMS: a badge whose `ruleType` the engine does not recognise evaluates as unearned with a warning, which is a badge nobody can ever get and an error nobody ever sees.",
        "",
        "`slug` is unique and is the key the reward ledger and the engine refer to. `iconAssetId` is a `MediaAsset` id from the media library.",
      ].join("\n"),
      requestBody: jsonRequestBody("AdminBadgeCreateBody"),
      responses: {
        "201": jsonResponse(
          "The created badge, status `draft` — authored but not yet earnable.",
          "AdminBadgeResponse",
        ),
        "400": errorResponse(
          "The body failed validation, **or** `rule` is not a valid payload for the `ruleType` given. `error.details` carries flattened issues whose paths are prefixed `rule.…`.",
          ["VALIDATION_FAILED"],
        ),
        ...GUARD_RESPONSES,
        "409": errorResponse(
          "The slug is already taken. `error.details.code` is `DUPLICATE_SLUG`. `Badge.slug` is unique across the whole table — it is what the engine and the reward ledger name a badge by.",
          ["CONFLICT"],
        ),
      },
    },
  },
  {
    method: "get",
    path: "/api/admin/content/badges",
    operation: {
      tags: ["Admin CMS"],
      summary: "List badges",
      description:
        "Every badge, by slug, with its rule. Unfiltered by status apart from archived rows — a `draft` badge is authored but inert, and seeing which is which is the point of the manager.",
      parameters: [INCLUDE_ARCHIVED_PARAM],
      responses: {
        "200": jsonResponse("Badges, by slug.", "AdminBadgeListResponse"),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
      },
    },
  },
  {
    method: "get",
    path: "/api/admin/content/badges/{id}",
    operation: {
      tags: ["Admin CMS"],
      summary: "Read one badge",
      description: "One badge and its rule, whatever its status.",
      parameters: [
        pathParam("id", "The badge's id.", { type: "string", format: "uuid" }),
      ],
      responses: {
        "200": jsonResponse("The badge.", "AdminBadgeResponse"),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
        "404": NOT_FOUND_RESPONSE,
      },
    },
  },
  {
    method: "patch",
    path: "/api/admin/content/badges/{id}",
    operation: {
      tags: ["Admin CMS"],
      summary: "Edit a badge",
      description: [
        "Partial edit. At least one field is required; an empty body is a `400`.",
        "",
        "**`ruleType` and `rule` travel together or not at all.** A `rule` without its type cannot be validated against anything, and a type without its rule would leave the stored payload describing the *previous* rule — either way the badge silently stops meaning what the row says. Sending one without the other is a `400`. (Both this and the at-least-one-field rule are Zod refinements, which are dropped in JSON Schema conversion, so they are stated here rather than visible below.)",
        "",
        "`status` is absent from the body, as everywhere on this surface.",
      ].join("\n"),
      parameters: [
        pathParam("id", "The badge's id.", { type: "string", format: "uuid" }),
      ],
      requestBody: jsonRequestBody("AdminBadgeUpdateBody"),
      responses: {
        "200": jsonResponse("The updated badge.", "AdminBadgeResponse"),
        "400": errorResponse(
          "The body failed validation, `ruleType` and `rule` were not sent together, **or** `rule` is not a valid payload for the `ruleType` given.",
          ["VALIDATION_FAILED"],
        ),
        ...GUARD_RESPONSES,
        "404": NOT_FOUND_RESPONSE,
        "409": errorResponse(
          'Either the slug is taken (`code: "DUPLICATE_SLUG"`), or the badge is `published` (`code: "EDIT_REQUIRES_UNPUBLISH"`). A published badge refuses an edit for the reason every published row does: changing a live badge\'s rule would change what a child has to do to earn it, retroactively, without review.',
          ["CONFLICT"],
        ),
      },
    },
  },
  {
    method: "post",
    path: "/api/admin/content/badges/{id}/transition",
    operation: {
      tags: ["Admin CMS"],
      summary: "Change a badge's status",
      description: transitionDescription("badge", BADGE_PUBLISH_EFFECT),
      parameters: [
        pathParam("id", "The badge's id.", { type: "string", format: "uuid" }),
      ],
      requestBody: jsonRequestBody("ContentTransitionBody"),
      responses: {
        "200": jsonResponse(
          "The badge at its new status.",
          "AdminBadgeResponse",
        ),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
        "404": NOT_FOUND_RESPONSE,
        "409": CONFLICT_RESPONSE,
      },
    },
  },
];
