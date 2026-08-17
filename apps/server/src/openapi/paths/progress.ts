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

/**
 * A quiz carries a status but no grade tags, so it is visible exactly when a
 * lesson the child can see points at it — which is why every clause of the lesson
 * `404` above applies here too, plus the quiz's own status.
 */
const QUIZ_NOT_FOUND_RESPONSE = errorResponse(
  "No such quiz, **or** it is not published, **or** no lesson this child can see points at it — the lesson is unpublished, its world is unpublished, or it is not tagged for this child's grade. All of them are the same `404`, for the reason the lesson `404` gives: a `403` would confirm the row exists (spec §7.3.4). A quiz is reached *through* its lesson because it has no grade tags of its own; resolving it by id alone would let a child post answers into another grade's content.",
  ["NOT_FOUND"],
);

const LESSON_ID_PARAM = pathParam(
  "id",
  "The lesson id. Must be a uuid, matching `/api/content/lessons/{id}`.",
  { type: "string", format: "uuid" },
);

const STORY_ID_PARAM = pathParam(
  "id",
  "The story id. Must be a uuid, matching `/api/content/stories/{id}`.",
  { type: "string", format: "uuid" },
);

/** The story equivalent of the lesson `404`, and identical in reasoning. */
const STORY_NOT_FOUND_RESPONSE = errorResponse(
  "No such story, **or** it is not published, **or** its world is not published, **or** it is not tagged for this child's grade. All four are the same `404`, matching `GET /api/content/stories/{id}` exactly — a `403` would confirm the row exists (spec §7.3.4). The agreement is load-bearing here: a story the content API will not open must not be one a child can be paid for finishing.",
  ["NOT_FOUND"],
);

const QUIZ_ID_PARAM = pathParam(
  "quizId",
  "The quiz id, as served in `LessonDetail.quiz.id`. Must be a uuid.",
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
    path: "/api/progress/lessons/{id}/complete",
    operation: {
      tags: ["Progress"],
      summary: "Finish a lesson and grant what it was worth",
      description: [
        `Marks the lesson complete and writes the reward grants for it, then answers with what was just earned and the child's running totals (FR-LSN-05, FR-GAM-01..02, FR-GAM-07). ${AUTHORITATIVE}`,
        "",
        "**There is no request body, and that is the contract.** Nothing a client could send would be believed: how many answers were right is read from the child's stored `QuizResponse` rows, and every amount is a constant in `services/rewardService.ts`. No endpoint in this API accepts a reward type, a reward amount or a source — rewards are earned, and there is no purchase path anywhere (FR-GAM-08).",
        "",
        "**Replaying a finished lesson grants nothing.** The second call answers `starsEarned: 0`, `coinsEarned: 0` and unchanged `totals`, and writes no ledger row. The guard is a unique index on `(childId, rewardType, sourceType, sourceId)` rather than a check in application code, so it holds under two taps racing each other and for any code path added later. A client must not read two zeros as a failure: it means *already done*, and the celebration is owed either way.",
        "",
        "What is granted on a first completion: **2 stars** for the lesson, **1 star** if its quiz was attempted at all (attempted, not passed — a quiz here has no fail state), **2 coins per correct answer**, and **5 coins** for the first lesson finished today. Correctness is counted from the *latest* response to each question, so a replay cannot inflate it.",
        "",
        '"Today" is a calendar day in the deployment\'s `APP_TIMEZONE`, not UTC — the daily grant is keyed on that local date, so a child playing before dawn is not handed a second one.',
        "",
        'This call **replaces** `POST /api/progress/lessons/{id}/step` with `{ step: "reward", completed: true }`; it performs that same step report itself, with the same write-once `completedAt`. Sending both is harmless but redundant.',
        "",
        '**`newBadges` and `newCharacters` are what *this* call unlocked**, on the same footing as `starsEarned` — a replay sends two empty arrays rather than re-announcing a badge the child was given last week. A badge is granted through the same ledger, as a row with `rewardType: "badge"`, `sourceType: "badge_unlock"` and `sourceId` set to the badge slug, so the unique index makes the grant idempotent exactly as it does for stars (FR-GAM-04). Characters are a `ChildCharacter` row, guarded by its own unique pair (FR-GAM-05).',
        "",
        "Which badges those are is **data, not code**: every published `Badge` the child has not already earned is evaluated against its `ruleType` + `rule` JSONB. A row whose `ruleType` is unknown, or whose `rule` is malformed, is logged and treated as unearned — a bad CMS row must never turn a child's celebration into a `500`.",
        "",
        "**`streak` is the learning streak after this completion** (FR-GAM-06): consecutive calendar days, in the deployment's `APP_TIMEZONE` rather than UTC or the device clock, on which the child finished something. A second lesson the same day leaves `current` unchanged. `milestone` is `3` or `7` only on the update that *reaches* that length, and `null` on every other call — including later days of the same streak and a second completion on the milestone day itself, so the special animation plays once.",
        "",
        "The order inside the transaction is load-bearing and worth knowing when reading a response: stars and coins are granted, then the streak advances, then badges are evaluated (so a `streak_days` rule sees today), then characters (so a `{ badges: n }` rule sees a badge granted a moment ago). All of it commits together or none of it does.",
        "",
        "`200`, not `201`: a replay creates nothing at all, so there is no resource this reliably creates.",
      ].join("\n"),
      parameters: [LESSON_ID_PARAM],
      responses: {
        "200": jsonResponse(
          "What this call granted, and what the child now has in total.",
          "LessonCompletionResponse",
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
    path: "/api/progress/stories/{id}/complete",
    operation: {
      tags: ["Progress"],
      summary: "Finish a story and grant what it was worth",
      description: [
        `Writes the reward grant for finishing a story and answers with what this call granted (FR-STORY-07). ${AUTHORITATIVE}`,
        "",
        "**Once per story per child, and reading again is free (FR-STORY-06).** The first finish grants **1 star + 5 coins**; every later one answers `alreadyCompleted: true` with `granted: null` and writes no ledger row. The endpoint stays callable on every reading — a reader must not withhold the call, or hide the ending, because the child has read the story before. `granted: null` is *already done*, not a failure.",
        "",
        "The guard is the ledger's unique index on `(childId, rewardType, sourceType, sourceId)`, not a check in application code, so two taps racing each other cannot both pay out; `alreadyCompleted` is derived from what this call actually inserted, which is what makes the loser of that race answer honestly.",
        "",
        "**There is no request body.** The amounts are constants in `services/rewardService.ts`; no endpoint in this API accepts a reward type, amount or source (FR-GAM-08).",
        "",
        "Deliberately smaller than a lesson completion: no streak, no badge and no character announcement. Those hang off finishing a lesson. A story writes its ledger rows here, and the milestone engine counts them the next time it runs — which is also where the library screen's `completed` checkmark comes from, so the badge on the cover and the balance in the reward strip cannot disagree.",
        "",
        "`200`, not `201`: a replay creates nothing at all.",
      ].join("\n"),
      parameters: [STORY_ID_PARAM],
      responses: {
        "200": jsonResponse(
          "Whether this reading had already been paid for, and what it granted if not.",
          "StoryCompletionResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "404": STORY_NOT_FOUND_RESPONSE,
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
        "",
        "`fallback` is optional and rides in `payload` the same way. It says the finished step played an English asset because the child's locale had none (`LessonDetail.assetFallbacks`, FR-I18N-01), and it is reported by the client rather than derived here because only the step knows which of the lesson's assets it actually used — the intro consumed the narration, the video the film. It feeds a content-gap report and nothing a child sees, so a client that reports it wrongly skews a report and affects no limit.",
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
  {
    method: "post",
    path: "/api/progress/quizzes/{quizId}/responses",
    operation: {
      tags: ["Progress"],
      summary: "Submit a finished quiz and score the lesson",
      description: [
        `Stores one \`QuizResponse\` row per answered question and writes the resulting percentage onto the lesson's \`LessonProgress.score\` (FR-QUIZ-08). ${AUTHORITATIVE}`,
        "",
        "**The whole quiz is posted once, after the last question** — not one call per answer. A child answers a handful of questions in about ninety seconds, and a round trip between each is a chance for the celebration to sit waiting on a network that is not there. The player posts this alongside the score screen and never blocks on it: a failure here loses a record, and a child who is stuck mid-lesson loses the lesson.",
        "",
        '**`isCorrect` means the *first* attempt was correct, not that the child eventually got there.** A quiz has no fail state — the child stays on a question, retrying among the options still available, until it is right (spec §5.7) — so "answered correctly in the end" is a constant `true` and worth nothing. `attempts` carries how hard it was.',
        "",
        "**The score is computed over the quiz, not over the submission.** `totalQuestions` is how many questions the quiz has, so posting only the questions that went well cannot raise the percentage. A question the player dropped as unrenderable therefore scores as missed, which is the fail-closed direction. The other end of that is the `400` on a repeated `questionId`: without it a submission could count more correct answers than the quiz has questions.",
        "",
        "**A replay never lowers `LessonProgress.score`.** The stored value is the child's best across every attempt. The `score` in *this* response is what this attempt earned, which may be lower than the row now holds — the three numbers here describe the submission, so that they agree with one another.",
        "",
        "`200`, not `201`: the rows are a side effect of scoring, and what comes back is the score rather than a resource a caller could go and read.",
      ].join("\n"),
      parameters: [QUIZ_ID_PARAM],
      requestBody: jsonRequestBody("QuizResponsesBody"),
      responses: {
        "200": jsonResponse(
          "What this attempt was worth. Nothing here is shown to the child — the score screen draws its stars from the answers it already holds.",
          "QuizResponsesResponse",
        ),
        "400": errorResponse(
          "Zod rejected the body — an empty `responses` array, more than ten of them, the same `questionId` twice, `attempts` below 1, an answer that is neither an option id nor a `{ pairs }` object, or an unknown key — **or** a `questionId` that belongs to some other quiz. The second is a `400` and not a `404` on purpose: the quiz named in the path was found and is this child's to answer, so the request is malformed rather than the resource missing. Nothing is stored either way; the whole submission is rejected.",
          ["VALIDATION_FAILED"],
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "404": QUIZ_NOT_FOUND_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
