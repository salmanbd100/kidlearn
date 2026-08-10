import type { LessonStep as PrismaLessonStep } from "@kidlearn/db";
import type { LessonStep } from "@kidlearn/types";
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
 * `routes/progress.ts` — mounted behind `requireParent` **and**
 * `requireActiveChild` in `routes/index.ts`, so every present and future
 * `/api/progress/*` path is covered by construction.
 *
 * Compile-time guard on the mirrored enum. `@kidlearn/types` may not depend on
 * `@kidlearn/db`, so `LESSON_STEPS` restates Prisma's `LessonStep` by hand. These
 * two assignments make that restatement checked rather than trusted: adding a step
 * to `schema.prisma` without adding it to `LESSON_STEPS` (or vice versa) fails
 * `pnpm typecheck` here, instead of shipping a player that cannot express a state
 * the database holds. Same pattern as `paths/children.ts` for `GradeLevel`.
 */
type _LessonStepsCoverPrisma = PrismaLessonStep extends LessonStep
  ? true
  : never;
type _PrismaCoversLessonSteps = LessonStep extends PrismaLessonStep
  ? true
  : never;
const _lessonStepMirrorIsExhaustive: [
  _LessonStepsCoverPrisma,
  _PrismaCoversLessonSteps,
] = [true, true];
void _lessonStepMirrorIsExhaustive;

const NO_ACTIVE_CHILD_RESPONSE = errorResponse(
  "No active child profile on this session. Call `POST /api/children/{id}/activate` first — progress belongs to a child, and which child is never taken from the request. Also returned when the session's active profile belongs to another parent, or has since been deleted.",
  ["FORBIDDEN"],
);

/**
 * Identical in cause and reasoning to the content API's `404`, and deliberately
 * so: the two endpoints must agree about which lessons exist for a child.
 */
const LESSON_NOT_FOUND_RESPONSE = errorResponse(
  "No such lesson, **or** it is not published, **or** its world is not published, **or** it is not tagged for this child's grade. All four are the same `404`, matching `GET /api/content/lessons/{id}` exactly: a `403` would confirm the row exists, and draft content must not be discoverable by probing (spec §7.3.4). The agreement matters — a lesson the content API will not serve must not be one this API will record progress against.",
  ["NOT_FOUND"],
);

const LESSON_ID_PARAM = pathParam(
  "id",
  "The lesson id. Must be a uuid, matching `/api/content/lessons/{id}`.",
  { type: "string", format: "uuid" },
);

/** The shared preamble: what "server-authoritative" means for a caller here. */
const AUTHORITATIVE = [
  "The client reports **that a step finished**; what the stored `currentStep` then becomes, whether the lesson counts as complete, and when any of it happened are the server's decisions (spec §7, FR-TIME-06).",
  "",
  "Whose progress is being written is never in the request. It is the session's active child profile, re-read under the signed-in parent's ownership on every call (FR-PROF-03).",
].join("\n");

export const PROGRESS_ROUTES: RouteDoc[] = [
  {
    method: "get",
    path: "/api/progress/lessons/{id}",
    operation: {
      tags: ["Progress"],
      summary: "Get the active child's progress in one lesson",
      description: [
        `Where this child left off, for resuming a lesson (FR-LSN-06). ${AUTHORITATIVE}`,
        "",
        "**`currentStep` is the last step the child *finished*, not the one they are looking at.** A player resuming should therefore open at its *successor* — after a finished `video`, at `activity`. Reading it as the current position replays a step the child has already done.",
        "",
        '`progress` is `null` when this child has never opened this lesson. That is a distinct state from a fresh row and cannot be folded into one: since `currentStep` means *finished*, no value of it could express "started, nothing done".',
        "",
        "A lesson with `completedAt` set is replayable. A replay walks all five steps again from `intro` and never clears or moves `completedAt` — the completion record is permanent, so a child re-watching something cannot move the date it was first finished.",
      ].join("\n"),
      parameters: [LESSON_ID_PARAM],
      responses: {
        "200": jsonResponse(
          "The stored progress, or `null` if this child has not opened the lesson.",
          "LessonProgressReadResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "404": LESSON_NOT_FOUND_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/progress/lessons/{id}/step",
    operation: {
      tags: ["Progress"],
      summary: "Record a finished lesson step",
      description: [
        `Upserts the child's \`LessonProgress\` row for this lesson (FR-LSN-06). ${AUTHORITATIVE}`,
        "",
        "**`currentStep` never moves backwards.** A replay re-posts `intro` while the row already says `quiz`; that call succeeds and answers `200` with the row unchanged, rather than regressing it and handing a resuming child the video again. Steps are compared by position in the ordered flow (`intro → video → activity → quiz → reward`), so an out-of-order or repeated report is acknowledged and absorbed. A child mashing taps must never lose progress.",
        "",
        '**`completed: true` is legal only with `step: "reward"`** — a lesson is not finished until its last step is. Any other pairing is a `400`; the rule is a Zod `.superRefine()`, which JSON Schema cannot express, so it is stated here (`backend.md §7`).',
        "",
        "`completedAt` is stamped **once**, by the server, on the first reward report. Later reports leave the existing value alone, so replaying a completed lesson does not move its completion date.",
      ].join("\n"),
      parameters: [LESSON_ID_PARAM],
      requestBody: jsonRequestBody("LessonStepBody"),
      responses: {
        "200": jsonResponse(
          "The stored progress after the report — which may be unchanged, if the reported step was one the child had already passed.",
          "LessonProgressResponse",
        ),
        "400": errorResponse(
          'Zod rejected the body: an unknown `step`, a missing `completed`, an unknown key (the schema is strict), or `completed: true` on a step other than `"reward"`. Also a non-uuid lesson id.',
          ["VALIDATION_FAILED"],
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "404": LESSON_NOT_FOUND_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/progress/events",
    operation: {
      tags: ["Progress"],
      summary: "Record a lesson-flow session event",
      description: [
        "Appends one `SessionEvent` row — the raw material the learning-time and screen-time figures are computed from in files 27–28 (FR-LSN-07, FR-TIME-06). This endpoint only records; nothing here aggregates.",
        "",
        "`201` rather than `200`: the log is append-only, so every call creates a resource. The player posts these fire-and-forget — a failure is logged and never blocks a child mid-lesson.",
        "",
        "**`clientTs` is required and then discarded.** `occurredAt` in the response is the server's own timestamp, and it is the only one stored. That is not a convenience: screen-time limits are derived from these rows, and a client able to backdate an event could spend an afternoon inside a 30-minute budget (FR-TIME-06). The field stays in the contract so the timestamp a client naturally sends is a documented no-op instead of a `400` from the strict body — and comparing it against `occurredAt` is how a client can see its own clock skew.",
        "",
        "`type` is restricted to the three lesson-flow events. Prisma's `SessionEventType` also holds `heartbeat`, `session_start`, `session_end` and the story events; those have their own producers, and accepting them here would let a client forge the rows a time limit is enforced from.",
        "",
        "`step` belongs on `step_complete` and is absent on the two lesson-level events. It is stored inside the row's `payload` alongside `lessonId`, because `SessionEvent` is one log shared by heartbeats, lessons and stories — a lesson-step column would be null on most of its rows.",
      ].join("\n"),
      requestBody: jsonRequestBody("SessionEventBody"),
      responses: {
        "201": jsonResponse(
          "The recorded event, carrying the server's timestamp.",
          "SessionEventResponse",
        ),
        "400": errorResponse(
          "Zod rejected the body: a `type` outside the three lesson-flow events, a non-uuid `lessonId`, a `clientTs` that is not an ISO-8601 timestamp, or an unknown key.",
          ["VALIDATION_FAILED"],
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "404": LESSON_NOT_FOUND_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
