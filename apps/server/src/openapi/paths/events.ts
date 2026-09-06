import type { SessionEventType } from "@kidlearn/db";
import type { ActivityEventType } from "@kidlearn/types";
import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonRequestBody,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
} from "../components.js";
import type { RouteDoc } from "../route-doc.js";

/**
 * `routes/events.ts` — mounted behind `requireParent` **and**
 * `requireActiveChild` in `routes/index.ts`, so every present and future
 * `/api/events/*` path is covered by construction.
 */
type _ActivityTypesExistInPrisma = ActivityEventType extends SessionEventType
  ? true
  : never;
const _activityTypesAreRealEvents: _ActivityTypesExistInPrisma = true;
void _activityTypesAreRealEvents;

const NO_ACTIVE_CHILD_RESPONSE = errorResponse(
  "No active child profile on this session. Call `POST /api/children/{id}/activate` first — time is recorded against a child, and which child is never taken from the request. Also returned when the session's active profile belongs to another parent, or has since been deleted.",
  ["FORBIDDEN"],
);

/**
 * Identical in cause and reasoning to the content API's `404`, and deliberately
 * so: an event must not be recordable against content the child cannot open.
 */
const REF_NOT_FOUND_RESPONSE = errorResponse(
  "`refId` names no lesson (or story) this child can see: it does not exist, it is not published, its world is not published, or it is not tagged for this child's grade. All of them are the same `404`, matching `GET /api/content/lessons/{id}` and `GET /api/content/stories/{id}` exactly — a `403` would confirm the row exists, and draft content must not be discoverable by probing (spec §7.3.4). Which table is consulted follows from `type`, so a `story_start` naming a lesson id is a `404` rather than a match.",
  ["NOT_FOUND"],
);

/** Why nothing on this surface can be talked out of a minute. */
const ANTI_TAMPER = [
  "**The client only ever says “I am here”.** No request on this surface carries a timestamp, a duration or a total. `occurredAt` is the database's `now()`, the cadence is throttled server-side, and minutes are derived from the stored rows — so refreshing the page, closing the tab, clearing storage or editing client state cannot lower a recorded minute (FR-TIME-06). There is nowhere client-side for the figure to live.",
  "",
  "Whose time is being recorded is never in the request. It is the session's active child profile, re-read under the signed-in parent's ownership on every call (FR-PROF-03).",
].join("\n");

export const EVENTS_ROUTES: RouteDoc[] = [
  {
    method: "post",
    path: "/api/events/heartbeat",
    operation: {
      operationId: "recordHeartbeat",
      tags: ["Learning Time"],
      summary: "Report that the child is still on a learning surface",
      description: [
        `Appends a \`heartbeat\` \`SessionEvent\` and answers with the child's total for today (FR-TIME-06). ${ANTI_TAMPER}`,
        "",
        "**There is no request body, and that is the contract.** A beat that could carry a field would be a beat that could carry a duration.",
        "",
        "**Post it every 30 seconds, and only while the tab is visible.** The 30s cadence is what the tail credit below is calibrated against, and pausing on a hidden tab is what stops a forgotten tab in a background window from billing a child for an afternoon. `useHeartbeat` in `apps/web` is the reference client.",
        "",
        "**`recorded: false` is a success, not a rejection.** A beat arriving less than 20 seconds after this child's previous one is dropped, so a tampered client posting in a loop cannot pack the density minutes are derived from. Do not retry on it — the next tick is the retry, and a `200` is deliberate: a student surface must never be handed a failure it would have to reason about. The floor is 20s rather than 30s so ordinary jitter, a slow response, or a tab regaining focus mid-interval is never mistaken for tampering.",
        "",
        "**`minutesToday` is returned on every beat, dropped or not.** It is the student session's own view of its total, so file 28 can check a daily limit without a parent-scoped call. Withholding it on a dropped beat would leave a throttled client blind to a limit it is about to cross.",
        "",
        "How minutes are derived, so the number is readable: events closer together than **90 seconds** belong to one sitting, a longer gap starts a new one, and each sitting is credited the span between its first and last event **plus 30 seconds** for the interval its last event stands for. A lone event is therefore a 30-second sitting, and `Math.round` makes that 1 minute. Every event type counts, not only heartbeats — a `lesson_complete` between two beats keeps a sitting alive. “Today” is a calendar day in the deployment's `APP_TIMEZONE`, never UTC and never a device clock.",
        "",
        "`200`, not `201`, even though it usually writes a row: a throttled beat writes nothing, and a status code that varied would make a client branch on it to learn what `recorded` already says.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "Whether this beat was stored, and how many minutes the child has learned today either way.",
          "HeartbeatResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/events/activity",
    operation: {
      operationId: "recordActivityEvent",
      tags: ["Learning Time"],
      summary: "Record one discrete thing the child did",
      description: [
        `Appends one \`SessionEvent\` for a lesson or story milestone (FR-LSN-07). ${ANTI_TAMPER}`,
        "",
        "These events do two jobs. They mark what a sitting was spent on, and they keep it alive between heartbeats — the density rule above counts every event type, so a milestone arriving 80 seconds after the last beat prevents a split the beat alone would have caused.",
        "",
        "**`refId` is the lesson or story the event is about, and `type` decides which.** One field rather than two, because a `story_start` naming a lesson id is not a request with a missing key — it is a contradiction, and a shape that could express it is a shape somebody will send. The id is resolved through the same visibility clause the content API serves the row with, so an event cannot name a draft, another grade's content, or a uuid a client invented.",
        "",
        "`type` is restricted to the five surface milestones. Prisma's `SessionEventType` also holds `heartbeat` (its own endpoint above) and `session_start` / `session_end` (no producer); accepting either here would let a client forge the rows a time limit is enforced from.",
        "",
        "**This is not the lesson player's endpoint.** `POST /api/progress/events` carries a lesson's `step` and locale-`fallback` detail, which this body has no field for, and the player keeps posting there. This one exists for the surfaces `/api/progress` is not about — the story reader — and for any future surface whose events are not lesson-shaped. Posting a lesson milestone here is legal and records the same row without the step detail.",
        "",
        "**Post it fire-and-forget.** Nothing a child sees should wait on it, and a failure is worth a console warning and no more: a missing analytics row costs a report some precision, and an interrupted lesson costs the lesson.",
        "",
        "`201`: the log is append-only, so a call that succeeds always creates a row.",
      ].join("\n"),
      requestBody: jsonRequestBody("ActivityEventBody"),
      responses: {
        "201": jsonResponse(
          "The recorded event, carrying the server's timestamp.",
          "ActivityEventResponse",
        ),
        "400": errorResponse(
          "Zod rejected the body: a `type` outside the five surface milestones, an empty `refId`, or an unknown key (the schema is strict).",
          ["VALIDATION_FAILED"],
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "404": REF_NOT_FOUND_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
