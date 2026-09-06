import type { ContentStatus } from "@kidlearn/db";
import type { ContentResourceName, ContentStatusValue } from "@kidlearn/types";
import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonRequestBody,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
  VALIDATION_RESPONSE,
} from "../components.js";
import { pathParam, queryParam, type RouteDoc } from "../route-doc.js";

/**
 * `routes/admin/content.ts` — the curriculum CMS (file 32, FR-CURR-04,
 * FR-CMS-01, FR-CMS-06).
 */
type _StatusesCoverPrisma = ContentStatus extends ContentStatusValue
  ? true
  : never;
type _PrismaCoversStatuses = ContentStatusValue extends ContentStatus
  ? true
  : never;
const _contentStatusMirrorIsExhaustive: [
  _StatusesCoverPrisma,
  _PrismaCoversStatuses,
] = [true, true];
void _contentStatusMirrorIsExhaustive;

/** The `403` every operation under `/api/admin` shares. */
const ADMIN_FORBIDDEN_RESPONSE = errorResponse(
  "Authenticated, but not an administrator. Every signed-in *parent* lands here — see `GET /api/admin/me` for why a valid session is not enough.",
  ["FORBIDDEN"],
);

const NOT_FOUND_RESPONSE = errorResponse(
  "No row with that id. Unlike the student API, this is a plain `404` and carries no content-safety subtlety: an admin is authorised to know what exists.",
  ["NOT_FOUND"],
);

const SLUG_CONFLICT_RESPONSE = errorResponse(
  "The slug is already taken. `error.details.code` is `DUPLICATE_SLUG`. Slugs are unique per model for worlds and subjects, and unique *within a parent* for topics and lessons.",
  ["CONFLICT"],
);

/**
 * An edit has two ways to conflict, and `error.details.code` is what tells them
 * apart on one status code.
 */
const EDIT_CONFLICT_RESPONSE = errorResponse(
  [
    'Either the slug is taken (`code: "DUPLICATE_SLUG"` — unique per model for worlds and subjects, unique *within a parent* for topics and lessons), or the row is `published` (`code: "EDIT_REQUIRES_UNPUBLISH"`, with `status` and `allowed`).',
    "",
    "**A published row refuses an edit.** The transition matrix guards the act of publishing, not the content that stays published afterwards, so without this a `PATCH` could rewrite a live lesson and reach a child without passing a reviewer again. Withdraw first — `published → draft` — then edit, then come back through `draft → in_review → approved → published`. `allowed` carries those first hops so a client can offer the withdrawal rather than only reporting the refusal.",
  ].join("\n"),
  ["CONFLICT"],
);

/**
 * The one paragraph that has to appear on every create and edit operation, and
 * the reason this file exists as a generator rather than four copies.
 */
/** `?jobId=…` — the edit-then-approve breadcrumb (file 37, FR-AI-07). */
const JOB_ID_QUERY_NOTE =
  "**`?jobId=…`** records `edit_then_approve` on that AI generation job (FR-AI-07), for a save made from the review queue's Edit button. It rides on this request rather than following it as a second call: a client that crashed between the two would leave a rewritten lesson whose audit trail says nobody rewrote it (FR-AI-08). Ignored — never an error — when the job named has already been decided, because the save is real work and the breadcrumb is not. Recording it publishes nothing: the publish guard also requires the job to *be* approved, which only `POST /api/admin/ai/jobs/{id}/approve` writes.";

const JOB_ID_QUERY_PARAM = {
  ...queryParam(
    "jobId",
    "The `AIGenerationJob` this edit belongs to, when the form was opened from the review queue.",
    { type: "string", format: "uuid" },
  ),
  required: false,
};

const NO_STATUS_IN_BODY = [
  '**The body cannot carry `status`.** The schema is `.strict()` and has no such key, so `{ "status": "published" }` is a `400` — status moves only through `POST /{id}/transition`, which is the only path that applies the transition matrix. An edit route that accepted `status` would be a second door to publishing, with no review behind it.',
  "",
  "**Nor `sortOrder`.** Position is owned by the reorder endpoint, which writes a whole sibling set at once; letting one row set its own index is how two rows end up sharing one.",
  "",
  "Every write stamps `updatedBy` with the acting administrator's `AdminUser.id`.",
].join("\n");

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

const TRANSITION_DESCRIPTION = [
  "Moves one row through the publishing workflow (FR-CMS-06). **The only way any content's `status` changes.**",
  "",
  TRANSITION_MATRIX,
  "",
  "Three properties of that table are the point of it:",
  "",
  "- **Publishing requires approval.** `published` is reachable from `approved` and nowhere else, so no path skips a human reviewer.",
  "- **Rejection means re-review.** `rejected → published` is four hops (`draft → in_review → approved → published`), all through a reviewer. An author cannot undo a rejection.",
  "- **The diagonal is empty.** A status cannot transition to itself; a no-op would re-stamp `updatedBy` and leave an audit trail claiming a review step nobody performed.",
  "",
  "**Publishing is immediate visibility.** There is no staging flag and no cache: the moment this writes `published`, `GET /api/content/*` returns the row, because those queries filter on `status = published` and nothing else gates them. `published → draft` withdraws it just as immediately, keeping the row and the lesson progress attached to it.",
  "",
  "The CMS's **Publish** button on an `in_review` row sends `approve` and then `publish` as two requests. Each hop is validated here in its own right — chaining on the client does not chain the check.",
].join("\n");

const REORDER_DESCRIPTION = [
  "Writes a whole sibling set's `sortOrder`, `0..n-1`, in one Serializable transaction.",
  "",
  '**`orderedIds` must be exactly the sibling set** — every id, no extras, no duplicates. Anything else is a `400` whose `error.details` names what was `missing`, what was `unknown`, and whether there were duplicates. A partial payload is refused rather than applied, because "move this to index 3" is a claim about the other rows too, and two such requests racing would leave two rows sharing an index.',
  "",
  "Restated here because Zod refinements are lost in JSON Schema conversion: `parentId` is **required** for topics (the subject) and lessons (the topic), and must be omitted or ignored for subjects, which have no parent.",
  "",
  "**`includeArchived` says which sibling set the payload claims to be**, and must match the list the administrator dragged — it is the body's counterpart to `?includeArchived=true` on the list operations. Omitted or `false`, archived siblings are excluded from the expected set and left untouched, so their `sortOrder` may tie with a live row's — which costs nothing, since an archived row appears in no ordered list and in no student query. Sent as `true`, they are expected in `orderedIds` and renumbered like any other sibling. Sending the wrong one is a `400`, not a partial write.",
  "",
  "`World` has no `sortOrder` column, so there is no `/worlds/reorder`.",
].join("\n");

const AT_LEAST_ONE_FIELD =
  "At least one field is required — an empty body is a `400`. (Zod's refinement carrying that rule is dropped in JSON Schema conversion, so it is stated here rather than visible in the schema below.)";

type ResourceDoc = {
  /** Path segment and the tail of every schema name. */
  segment: ContentResourceName;
  singular: string;
  /** Registered component schema names, from `components.ts`. */
  itemSchema: string;
  listSchema: string;
  createBodySchema: string;
  updateBodySchema: string;
  /** What this resource is, in one sentence, for the list operation. */
  summary: string;
  /** Anything true of this resource and not the others. */
  notes: string;
  listQueryParams: Array<Record<string, unknown>>;
  /** `false` for worlds, which have no `sortOrder`. */
  isOrderable: boolean;
};

const INCLUDE_ARCHIVED_PARAM = {
  name: "includeArchived",
  in: "query",
  required: false,
  description:
    "`true` to include archived rows, which are hidden by default. Archiving is how content is retired, and a list that showed every retirement forever is a list an admin stops reading.",
  schema: { type: "string", enum: ["true", "false"] },
};

function parentFilterParam(
  name: string,
  parent: string,
): Record<string, unknown> {
  return {
    name,
    in: "query",
    required: false,
    description: `Restrict the list to one ${parent}'s children. Omitted, the whole set is returned — which is what the CMS tree fetches once and filters client-side.`,
    schema: { type: "string", format: "uuid" },
  };
}

const RESOURCES: ResourceDoc[] = [
  {
    segment: "worlds",
    singular: "world",
    itemSchema: "AdminWorld",
    listSchema: "AdminWorldListResponse",
    createBodySchema: "AdminWorldCreateBody",
    updateBodySchema: "AdminWorldUpdateBody",
    summary:
      "Worlds — the themed settings lessons are placed in (FR-WORLD-05).",
    notes:
      "A world carries a `palette`, the flat token→colour map the student UI themes itself from, and a `mascotAssetId`. It has **no `sortOrder`**: worlds are chosen on a map rather than listed in sequence, so there is no `/worlds/reorder`.",
    listQueryParams: [INCLUDE_ARCHIVED_PARAM],
    isOrderable: false,
  },
  {
    segment: "subjects",
    singular: "subject",
    itemSchema: "AdminSubject",
    listSchema: "AdminSubjectListResponse",
    createBodySchema: "AdminSubjectCreateBody",
    updateBodySchema: "AdminSubjectUpdateBody",
    summary: "Subjects — the top level of the curriculum tree.",
    notes:
      "Subjects have no parent, so `PATCH /subjects/reorder` orders the whole set and takes no `parentId`.",
    listQueryParams: [INCLUDE_ARCHIVED_PARAM],
    isOrderable: true,
  },
  {
    segment: "topics",
    singular: "topic",
    itemSchema: "AdminTopic",
    listSchema: "AdminTopicListResponse",
    createBodySchema: "AdminTopicCreateBody",
    updateBodySchema: "AdminTopicUpdateBody",
    summary: "Topics — a subject's children, and a lesson's parent.",
    notes:
      "`subjectId` is settable on create and **absent from the edit body**: moving a topic between subjects is a reordering event on two sibling sets, not a field change, and it is out of scope for this file.",
    listQueryParams: [
      INCLUDE_ARCHIVED_PARAM,
      parentFilterParam("subjectId", "subject"),
    ],
    isOrderable: true,
  },
  {
    segment: "lessons",
    singular: "lesson",
    itemSchema: "AdminLesson",
    listSchema: "AdminLessonListResponse",
    createBodySchema: "AdminLessonCreateBody",
    updateBodySchema: "AdminLessonUpdateBody",
    summary: "Lessons — the leaf a child actually plays.",
    notes: [
      "The authored shape (FR-CMS-01): a title and intro script **in both locales**, a world, one or more grade levels, and the ids of the activity, quiz and per-locale video that make up the lesson's steps.",
      "",
      "`activityId`, `quizId` and `translations.*.videoAssetId` are all nullable, because the editors that produce them arrive with file 33 — a lesson has to be draftable before its parts exist. `videoAssetId` is a `MediaAsset` id rather than a URL: a URL on the lesson would be a second, unmanaged copy of one.",
      "",
      "`conceptsIntroduced` are the prefixed tokens the weekly report unions across a week — `letter:A`, `word:apple`, `number:7` (file 30). The prefix is validated, because a typo produces a token no report will ever match and no error anyone will ever see.",
      "",
      "`topicId` is settable on create and absent from the edit body — see Topics.",
    ].join("\n"),
    listQueryParams: [
      INCLUDE_ARCHIVED_PARAM,
      parentFilterParam("topicId", "topic"),
      parentFilterParam("worldId", "world"),
    ],
    isOrderable: true,
  },
];

/** Responses shared by every operation here, in the order they are documented. */
const GUARD_RESPONSES = {
  "401": UNAUTHORIZED_RESPONSE,
  "403": ADMIN_FORBIDDEN_RESPONSE,
  "500": INTERNAL_RESPONSE,
};

/** `worlds` → `Worlds`, `world` → `World`, for the generated `operationId`s. */
function pascal(segment: string): string {
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function docsFor(resource: ResourceDoc): RouteDoc[] {
  const base = `/api/admin/content/${resource.segment}`;
  const id = pathParam("id", `The ${resource.singular}'s id.`, {
    type: "string",
    format: "uuid",
  });

  const docs: RouteDoc[] = [
    {
      method: "get",
      path: base,
      operation: {
        operationId: `listAdmin${pascal(resource.segment)}`,
        tags: ["Admin CMS: Curriculum"],
        summary: `List ${resource.segment}`,
        description: [
          resource.summary,
          "",
          "**Unfiltered by status, deliberately.** The student API returns `published` rows and nothing else; this one exists to show drafts, and every row carries the `status` that decides whether a child can see it. Archived rows are the one exception — hidden unless asked for.",
          "",
          "Text arrives in **both locales** under `translations`, unlike `/api/content/*`, which resolves to the child's language. An author edits the pair.",
          "",
          resource.notes,
        ].join("\n"),
        parameters: resource.listQueryParams,
        responses: {
          "200": jsonResponse(
            `Every ${resource.singular}, ordered as the CMS tree renders them.`,
            resource.listSchema,
          ),
          "400": VALIDATION_RESPONSE,
          ...GUARD_RESPONSES,
        },
      },
    },
    {
      method: "post",
      path: base,
      operation: {
        operationId: `createAdmin${pascal(resource.singular)}`,
        tags: ["Admin CMS: Curriculum"],
        summary: `Create a ${resource.singular}`,
        description: [
          `Creates a ${resource.singular} as **\`draft\`** — the only status a create can produce, and not a field the caller supplies.`,
          "",
          NO_STATUS_IN_BODY,
          "",
          "New rows are appended: `sortOrder` is set to one past the current highest among the siblings.",
          "",
          resource.notes,
        ].join("\n"),
        requestBody: jsonRequestBody(resource.createBodySchema),
        responses: {
          "201": jsonResponse(
            `The created ${resource.singular}, status \`draft\`.`,
            `${resource.itemSchema}Response`,
          ),
          "400": VALIDATION_RESPONSE,
          ...GUARD_RESPONSES,
          "404": NOT_FOUND_RESPONSE,
          "409": SLUG_CONFLICT_RESPONSE,
        },
      },
    },
    {
      method: "get",
      path: `${base}/{id}`,
      operation: {
        operationId: `getAdmin${pascal(resource.singular)}`,
        tags: ["Admin CMS: Curriculum"],
        summary: `Read one ${resource.singular}`,
        description: [
          `One ${resource.singular} in the authoring shape, whatever its status.`,
          "",
          resource.notes,
        ].join("\n"),
        parameters: [id],
        responses: {
          "200": jsonResponse(
            `The ${resource.singular}.`,
            `${resource.itemSchema}Response`,
          ),
          "400": VALIDATION_RESPONSE,
          ...GUARD_RESPONSES,
          "404": NOT_FOUND_RESPONSE,
        },
      },
    },
    {
      method: "patch",
      path: `${base}/{id}`,
      operation: {
        operationId: `updateAdmin${pascal(resource.singular)}`,
        tags: ["Admin CMS: Curriculum"],
        summary: `Edit a ${resource.singular}`,
        description: [
          `Partial edit. ${AT_LEAST_ONE_FIELD}`,
          "",
          "**A `published` row refuses an edit** with a `409` — withdraw it to `draft` first. See that response below for why.",
          "",
          NO_STATUS_IN_BODY,
          "",
          "`translations`, if present, must carry **both** locales. A partial translation write is what produces content that falls back to English part-way through a Bangla learner's session (FR-I18N-01), and the CMS form submits the pair together in any case.",
          "",
          resource.notes,
          "",
          JOB_ID_QUERY_NOTE,
        ].join("\n"),
        parameters: [id, JOB_ID_QUERY_PARAM],
        requestBody: jsonRequestBody(resource.updateBodySchema),
        responses: {
          "200": jsonResponse(
            `The updated ${resource.singular}.`,
            `${resource.itemSchema}Response`,
          ),
          "400": VALIDATION_RESPONSE,
          ...GUARD_RESPONSES,
          "404": NOT_FOUND_RESPONSE,
          "409": EDIT_CONFLICT_RESPONSE,
        },
      },
    },
    {
      method: "post",
      path: `${base}/{id}/transition`,
      operation: {
        operationId: `transitionAdmin${pascal(resource.singular)}`,
        tags: ["Admin CMS: Curriculum"],
        summary: `Change a ${resource.singular}'s status`,
        description: TRANSITION_DESCRIPTION,
        parameters: [id],
        requestBody: jsonRequestBody(
          "ContentTransitionBody",
          "The target status. Whether the hop is legal from the row's current status is decided server-side.",
        ),
        responses: {
          "200": jsonResponse(
            `The ${resource.singular} at its new status.`,
            `${resource.itemSchema}Response`,
          ),
          "400": VALIDATION_RESPONSE,
          ...GUARD_RESPONSES,
          "404": NOT_FOUND_RESPONSE,
          "409": errorResponse(
            [
              'The hop is not in the matrix above. `error.details` carries `code: "INVALID_TRANSITION"`, the `from` and `to` that were refused, and `allowed` — the legal next states — so a client can refresh its buttons from the rejection instead of guessing.',
              "",
              "`409` rather than `400`: the request is well formed and the target status is a real one. What is wrong is the state the row happens to be in, which may not be wrong a moment later.",
              "",
              'Publishing carries a second cause. `code: "AI_REVIEW_REQUIRED"` means the lesson was written by a generation job that no reviewer has approved (FR-AI-07); `details` carries `jobId`, `jobStatus` and `decision`. Only `Lesson` among these four can be refused this way — a world, a subject and a topic are structure an admin defines, not content a model writes. The fix is the AI review queue, not the matrix.',
            ].join("\n"),
            ["CONFLICT"],
          ),
        },
      },
    },
  ];

  if (resource.isOrderable) {
    docs.push({
      method: "patch",
      path: `${base}/reorder`,
      operation: {
        operationId: `reorderAdmin${pascal(resource.segment)}`,
        tags: ["Admin CMS: Curriculum"],
        summary: `Reorder ${resource.segment}`,
        description: REORDER_DESCRIPTION,
        requestBody: jsonRequestBody("ContentReorderBody"),
        responses: {
          "200": jsonResponse(
            "The ids in their persisted order — what the client settles its optimistic drag animation against.",
            "ReorderedIdsResponse",
          ),
          "400": errorResponse(
            "The body failed validation, **or** `orderedIds` was not exactly the sibling set, **or** `parentId` was missing where it is required. `error.details` distinguishes them: a Zod failure carries `formErrors`/`fieldErrors`, a set mismatch carries `missing`/`unknown`/`hasDuplicates`.",
            ["VALIDATION_FAILED"],
          ),
          ...GUARD_RESPONSES,
        },
      },
    });
  }

  return docs;
}

const CHARACTER_SHEET_BASE = "/api/admin/content/character-sheets";

const CHARACTER_SHEET_PURPOSE = [
  "A character sheet is the **stable visual description** of one recurring character, and its only consumer is the illustration prompt (FR-AI-09).",
  "",
  'It exists because an image model is stateless: it draws whatever one prompt says and remembers nothing about the picture it drew a second ago, so "the rabbit" on page 3 and "the rabbit" on page 7 come back as two different rabbits. `POST /api/admin/ai/generate/illustrations` prepends every applicable sheet\'s `description` **verbatim** to every page\'s prompt, which is the whole mechanism.',
  "",
  "**These rows are not content and carry no `status`.** Nothing under `/api/content/*` or `/api/stories/*` reads this table, so there is nothing for the publishing workflow to protect and no state a child could see. That is why they sit outside the transition machinery the four resources above share, along with ordering, translations and the `updatedBy` stamp — a sheet has none of them.",
  "",
  "**`worldId` is nullable and means something.** A sheet scoped to a world applies to the stories set there; a sheet with no world is a figure who recurs across worlds — a narrator, a child protagonist — and applies to all of them.",
].join("\n");

const CHARACTER_SHEET_ROUTES: RouteDoc[] = [
  {
    method: "get",
    path: CHARACTER_SHEET_BASE,
    operation: {
      operationId: "listCharacterSheets",
      tags: ["Admin CMS: Characters"],
      summary: "List character sheets",
      description: [
        CHARACTER_SHEET_PURPOSE,
        "",
        "**`?worldId=` narrows to that world *plus* the world-less sheets, not to an exact match.** That is the set the illustration generator applies to a story set there, and a filter answering differently would show an author a cast their pictures do not use. (Stated here because JSON Schema cannot say what a filter means.)",
        "",
        "Ordered world-scoped first, then by slug — the same order the generator builds its prompt block in, so what is listed is what is prepended.",
      ].join("\n"),
      parameters: [
        {
          name: "worldId",
          in: "query",
          required: false,
          description:
            "Restrict to one world's sheets plus the world-less ones. Omitted, every sheet is returned.",
          schema: { type: "string", format: "uuid" },
        },
      ],
      responses: {
        "200": jsonResponse(
          "Every matching sheet, world-scoped first then by slug.",
          "CharacterSheetListResponse",
        ),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
      },
    },
  },
  {
    method: "post",
    path: CHARACTER_SHEET_BASE,
    operation: {
      operationId: "createCharacterSheet",
      tags: ["Admin CMS: Characters"],
      summary: "Create a character sheet",
      description: [
        CHARACTER_SHEET_PURPOSE,
        "",
        '**`description` is prompt text, not notes**, which is why the floor is 20 characters: "a rabbit" gives an image model nothing to be consistent about, and a sheet that contributes nothing makes the drift it was created to stop look like the feature working. Write the colours, the size, the clothing and the distinguishing features.',
        "",
        "**Editing a sheet changes every illustration drawn afterwards and none drawn before.** Consistency holds forward, not backward — pictures already generated are not redrawn.",
        "",
        "`slug` is optional and derived from `name` when omitted, suffixed until free. It is **not editable afterwards**: it is how `POST /character-sheets/from-job` recognises a character it has already saved, so a slug that could change would let the same mascot be imported twice under two names.",
      ].join("\n"),
      requestBody: jsonRequestBody("AdminCharacterSheetCreateBody"),
      responses: {
        "201": jsonResponse("The sheet as stored.", "CharacterSheetResponse"),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
        "404": errorResponse("`worldId` names no world.", ["NOT_FOUND"]),
        "409": errorResponse(
          "An explicitly supplied `slug` is already taken. Omit it and one is derived from `name` and suffixed until free.",
          ["CONFLICT"],
        ),
      },
    },
  },
  {
    method: "post",
    path: `${CHARACTER_SHEET_BASE}/from-job`,
    operation: {
      operationId: "createCharacterSheetsFromJob",
      tags: ["Admin CMS: Characters"],
      summary: "Save a story generation's cast as character sheets",
      description: [
        "Promotes the `characterDescriptions` of a `story` generation into sheets — the one-click **Save as character sheet** action (FR-AI-09).",
        "",
        "They are read out of the job's `rawOutput` rather than from a column because `POST /api/admin/ai/generate/story` deliberately does not persist them: a story that is later rejected must not leave character records behind. Promoting them is the administrator saying this story's cast is worth keeping.",
        "",
        "**A slug that already has a sheet is skipped, never overwritten**, and counted in `skipped`. The second story set in a world will describe the same mascot again in slightly different words, and taking the newer wording would silently change how that mascot is drawn in every story already using it. Editing a sheet stays an explicit `PATCH`.",
        "",
        "The world is inherited from the story the job wrote, so the sheets land scoped the way the illustration generator will look for them. A job whose story was not written — a `failed` generation — yields world-less sheets.",
        "",
        '`201` even when every character was skipped: the request was well formed and the outcome is in the body. A status that varied with "did anything get created" would make an idempotent re-import look like a different kind of event.',
      ].join("\n"),
      requestBody: jsonRequestBody("AdminPromoteJobCharactersBody"),
      responses: {
        "201": jsonResponse(
          "The sheets created, and how many characters already had one.",
          "PromotedCharacterSheetsResponse",
        ),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
        "404": errorResponse("No job with that id.", ["NOT_FOUND"]),
        "409": errorResponse(
          "The job is not a `story` generation, or its output holds no character descriptions — a `failed` job that never produced a valid answer, for instance. `409` rather than `404`: the job exists, and what is wrong is its contents.",
          ["CONFLICT"],
        ),
      },
    },
  },
  {
    method: "patch",
    path: `${CHARACTER_SHEET_BASE}/{id}`,
    operation: {
      operationId: "updateCharacterSheet",
      tags: ["Admin CMS: Characters"],
      summary: "Edit a character sheet",
      description: [
        "Rewrites a sheet's `name`, `description` or `worldId`.",
        "",
        "**`slug` is absent from the body** — see the create operation for why it cannot change.",
        "",
        "**This changes every illustration drawn from now on and none drawn before.** A picture already generated is not redrawn, so a description corrected after a story was illustrated leaves that story on the old look until its pages are regenerated.",
        "",
        AT_LEAST_ONE_FIELD,
      ].join("\n"),
      parameters: [
        pathParam("id", "The character sheet's id.", {
          type: "string",
          format: "uuid",
        }),
      ],
      requestBody: jsonRequestBody("AdminCharacterSheetUpdateBody"),
      responses: {
        "200": jsonResponse("The sheet as stored.", "CharacterSheetResponse"),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
        "404": errorResponse(
          "No sheet with that id, or `worldId` names no world.",
          ["NOT_FOUND"],
        ),
      },
    },
  },
];

export const ADMIN_CONTENT_ROUTES: RouteDoc[] = [
  ...RESOURCES.flatMap(docsFor),
  ...CHARACTER_SHEET_ROUTES,
];
