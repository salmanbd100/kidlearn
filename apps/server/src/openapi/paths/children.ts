import type { GradeLevel } from "@kidlearn/db";
import { GRADE_LEVELS, type GradeLevelValue } from "@kidlearn/types";
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
 * `routes/children.ts` — `requireParent` guards the whole router.
 *
 * Compile-time guard on the mirrored enum. `@kidlearn/types` may not depend on
 * `@kidlearn/db`, so `GRADE_LEVELS` restates Prisma's `GradeLevel` by hand. These
 * two assignments make that restatement checked rather than trusted: adding a
 * grade to `schema.prisma` without adding it to `GRADE_LEVELS` (or vice versa)
 * fails `pnpm typecheck` here, instead of silently shipping a spec that omits a
 * legal value.
 */
type _GradeLevelsCoverPrisma = GradeLevel extends GradeLevelValue
  ? true
  : never;
type _PrismaCoversGradeLevels = GradeLevelValue extends GradeLevel
  ? true
  : never;
const _gradeLevelMirrorIsExhaustive: [
  _GradeLevelsCoverPrisma,
  _PrismaCoversGradeLevels,
] = [true, true];
void _gradeLevelMirrorIsExhaustive;

/**
 * `404`, never `403`, for a profile owned by somebody else.
 *
 * This is a deliberate content-safety decision (NFR-SAFE-02), not an oversight: a
 * `403` would confirm that the id exists, which is precisely what a probe is
 * after. Documented here so nobody "fixes" it into a 403 later.
 */
const CHILD_NOT_FOUND_RESPONSE = errorResponse(
  "No such profile — **or** it belongs to another parent. The two are deliberately indistinguishable (NFR-SAFE-02): answering `403` for someone else's child would confirm the id exists.",
  ["NOT_FOUND"],
);

/**
 * The PIN gate's two `403` codes, on every route that writes a profile.
 *
 * Two codes rather than one because the client's next screen differs:
 * `PIN_REQUIRED` means no PIN exists, so open setup; `PIN_VERIFICATION_REQUIRED`
 * means one exists but this session's 15-minute grant has lapsed, so open the PIN
 * pad. A client telling them apart by matching message strings breaks the first
 * time someone rewords a message.
 */
const PIN_GATE_RESPONSE = errorResponse(
  "The parental gate is shut. `PIN_REQUIRED` — no PIN is set on this account, so send the parent to setup. `PIN_VERIFICATION_REQUIRED` — a PIN exists but this session has no live grant; call `POST /api/parent/pin/verify`.",
  ["PIN_REQUIRED", "PIN_VERIFICATION_REQUIRED"],
);

const CHILD_ID_PARAM = pathParam(
  "id",
  "The child profile id. Validated as a non-empty string rather than a uuid, so a malformed id yields the same `404` as an unknown one.",
);

const LEARNING_TIME_RANGE_PARAM = queryParam(
  "range",
  "Which window to measure. `today` is a calendar day in the deployment's `APP_TIMEZONE`, `week` starts Monday, `month` is the calendar month. Required — there is no default, because a silent one would leave the returned `from`/`to` as the only clue about which window was actually measured.",
  { type: "string", enum: ["today", "week", "month"] },
);

export const CHILDREN_ROUTES: RouteDoc[] = [
  {
    method: "post",
    path: "/api/children",
    operation: {
      tags: ["Children"],
      summary: "Create a child profile",
      description: [
        "Creates a learner profile (FR-PROF-01..02). At most **five** per household.",
        "",
        "The only route on this router gated by `requireConsent`: a child profile must not exist before the parent has accepted COPPA consent (FR-AUTH-03). The other routes read or amend a profile that consent already covers.",
        "",
        "`avatarCharacterId` must name a real `Character` row; an unknown one is a `400`, not a `404`, because it arrived in the body.",
      ].join("\n"),
      requestBody: jsonRequestBody("CreateChildBody"),
      responses: {
        "201": jsonResponse(
          "The created profile. `stats` counters are zero placeholders until files 23–24 wire the reward ledger.",
          "ChildProfileResponse",
        ),
        "400": errorResponse(
          "Zod rejected the body (`age` outside 3–6, unknown key — the schema is strict), or `avatarCharacterId` names no known character, in which case `error.details.field` is `avatarCharacterId`.",
          ["VALIDATION_FAILED"],
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": errorResponse(
          "One of three gates is shut. `CONSENT_REQUIRED` — COPPA consent has not been recorded; call `POST /api/parent/consent` first. `PIN_REQUIRED` / `PIN_VERIFICATION_REQUIRED` — the parental gate (FR-AUTH-04). Onboarding does not normally meet the PIN codes here, because `POST /api/parent/pin` opens the grant as it stores the PIN.",
          ["CONSENT_REQUIRED", "PIN_REQUIRED", "PIN_VERIFICATION_REQUIRED"],
        ),
        "409": errorResponse(
          "The household already holds five profiles (FR-PROF-01). Delete one first.",
          ["CONFLICT"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/children",
    operation: {
      tags: ["Children"],
      summary: "List the parent's child profiles",
      description:
        "Every profile belonging to the signed-in parent, oldest first — the order the profile picker renders. Scoped entirely by the session; there is no parent id parameter, so a caller cannot ask for anyone else's list.",
      responses: {
        "200": jsonResponse(
          "The profiles, oldest first. An empty array for a parent who has not created one yet.",
          "ChildProfileListResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/children/{id}",
    operation: {
      tags: ["Children"],
      summary: "Get one child profile",
      parameters: [CHILD_ID_PARAM],
      responses: {
        "200": jsonResponse("The profile.", "ChildProfileResponse"),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "404": CHILD_NOT_FOUND_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/children/{id}/characters",
    operation: {
      tags: ["Characters"],
      summary:
        "List every character, flagged with what this child has unlocked",
      description: [
        "What the parent's avatar picker offers for one child (FR-GAM-05, FR-PROF-02).",
        "",
        "**`GET /api/characters` cannot answer this.** That endpoint lists the starter set with no child in scope, so a character this child has *earned* never appears in it — while `PATCH /api/children/{id}` would have accepted it. This is the same condition that write route enforces, which is what keeps the two ends of `avatarCharacterId` in agreement.",
        "",
        "**Locked characters are in the list, and that is the point.** A picker showing only what a child already has cannot show them what there is to earn, so the whole published set comes back and `isUnlocked` says which of them may be worn. `isUnlocked` is `true` for every `isDefault` character and for anything this child has earned.",
        "",
        "Not PIN-gated, matching the other reads on this router. The write it feeds is.",
        "",
        "Identical in shape to `GET /api/me/characters`, which answers the same question for the *student* session; this one takes a child id because a parent may hold five profiles and none of them active.",
        "",
        "Unpublished characters never appear (`backend.md §4`), and `imageUrl` is `null` until the illustrated character sheet lands (design.md §9).",
      ].join("\n"),
      parameters: [CHILD_ID_PARAM],
      responses: {
        "200": jsonResponse(
          "Every published character, alphabetically by name so the picker's order stays stable as characters unlock.",
          "CharacterUnlockListResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "404": CHILD_NOT_FOUND_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/children/{id}/learning-time",
    operation: {
      tags: ["Learning Time"],
      summary: "How long this child has learned in one window",
      description: [
        "Minutes of actual learning time for one child (FR-DASH-02), for the parent dashboard.",
        "",
        "**The figure is derived, not stored.** It comes from the density of the `SessionEvent` rows the server timestamped: events closer together than 90 seconds belong to one sitting, a longer gap starts a new one, and each sitting is credited its span plus the 30-second interval its last event stands for. No client increments a counter and no request anywhere carries a duration, so a child cannot shorten this by refreshing and a device cannot inflate it (FR-TIME-06).",
        "",
        "**`from` and `to` are the window's own edges, not the moment it was asked for.** `[from, to)` is a whole calendar period in the deployment's `APP_TIMEZONE`, so `to` for `today` is the coming local midnight rather than now. A caller charting the period therefore has its bounds without recomputing them in a zone it has no way to know. `week` starts Monday; `month` is the calendar month.",
        "",
        "A sitting that crosses midnight is split by whichever window is queried, and each half is credited its own tail — a known over-count of one 30-second interval per crossing. Accepted deliberately: the alternative, attributing a whole sitting to the day it began, makes a lesson finished at 00:20 vanish from the day a parent watched it happen.",
        "",
        "One timezone for the whole deployment, from `APP_TIMEZONE`. A per-parent timezone is post-MVP.",
        "",
        "Not PIN-gated, matching the other reads on this router: it reports minutes and nothing about what was learned, and the dashboard rendering it sits behind the client-side parental gate (FR-AUTH-04).",
      ].join("\n"),
      parameters: [CHILD_ID_PARAM, LEARNING_TIME_RANGE_PARAM],
      responses: {
        "200": jsonResponse(
          "Minutes learned in the window, with the window's own bounds.",
          "LearningTimeReadResponse",
        ),
        "400": errorResponse(
          "`range` is missing, is not one of `today` / `week` / `month`, or an unknown query parameter was sent (the schema is strict).",
          ["VALIDATION_FAILED"],
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "404": CHILD_NOT_FOUND_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/children/{id}/screen-time",
    operation: {
      tags: ["Screen Time"],
      summary: "Read this child's daily limit and access window",
      description: [
        "The policy behind FR-TIME-01/04/05, as the parent's settings form reads it back.",
        "",
        '**A child with no policy gets all-nulls, not a `404`.** "No limits set" is a decision, not a missing resource, so the form has no "not configured yet" branch and the shape it renders is the shape it submits.',
        "",
        "**PIN-gated, unlike every other read on this router.** The other `GET`s here feed screens a child may legitimately be looking at — the profile picker, an avatar list. This one is the control a child would most like to change, so both verbs sit behind the parental gate (FR-AUTH-04, FR-TIME-05). The student surface reads its own allowance from `GET /api/screen-time/status`, which is scoped to the session's active child.",
        "",
        "Times are `\"HH:MM\"` in the deployment's `APP_TIMEZONE`, round-tripping the exact strings the write accepted. A window is a wall-clock fact about a household's evening, so it is never sent as a timestamp — a timestamp would carry a date and a zone that mean nothing here.",
      ].join("\n"),
      parameters: [CHILD_ID_PARAM],
      responses: {
        "200": jsonResponse(
          "The stored policy, or all-nulls for a child who has none.",
          "ScreenTimeSettingResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": PIN_GATE_RESPONSE,
        "404": CHILD_NOT_FOUND_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "patch",
    path: "/api/children/{id}/screen-time",
    operation: {
      tags: ["Screen Time"],
      summary: "Set this child's daily limit and access window",
      description: [
        "Stores the whole policy (FR-TIME-01, FR-TIME-04). PIN-gated (FR-AUTH-04, FR-TIME-05).",
        "",
        '**`PATCH` by verb, total by body.** All three fields are required and nullable, so switching something off is a value the parent sends rather than a key they omit — a partial body would make "clear the window" and "leave the window alone" the same request.',
        "",
        "**Upserts on the child.** There is at most one policy per child by construction, so calling this twice updates one row rather than creating a second, and a parent's first save is not a different code path from their tenth.",
        "",
        "`dailyLimitMinutes` is `null` (off) or one of `15`, `30`, `45`, `60`, `90` — a closed set, because an arbitrary number invites a 7-minute allowance, which is a child cut off mid-lesson every day.",
        "",
        "**`windowStart` and `windowEnd` must be set or cleared together**, and the rule is a Zod refinement with no JSON Schema equivalent — so the schema below cannot show it. Half a window is not a rule the enforcement code could act on, and it is rejected as `400 VALIDATION_FAILED` rather than stored and interpreted later.",
        "",
        "A window whose start equals its end is accepted and treated as **no window at all**. It is what a parent gets by dragging both inputs together, it expresses nothing, and the only other reading — open for zero minutes — locks a child out of the app all day from a slip they could not diagnose.",
        "",
        "`windowStart` later than `windowEnd` is legal and wraps midnight: `20:00`–`07:00` allows 21:30 and 06:30 and refuses noon.",
      ].join("\n"),
      parameters: [CHILD_ID_PARAM],
      requestBody: jsonRequestBody(
        "ScreenTimeBody",
        "Every field is required and nullable. The two window ends must be **both set or both null** — a refinement JSON Schema cannot express, so it is not visible in the schema below.",
      ),
      responses: {
        "200": jsonResponse(
          "The stored policy, read back in the same format it was sent.",
          "ScreenTimeSettingResponse",
        ),
        "400": errorResponse(
          'Zod rejected the body — a limit outside the offered set, a malformed `"HH:MM"`, a half-set window, an unknown key (the schema is strict), or a missing field — or the path parameter.',
          ["VALIDATION_FAILED"],
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": PIN_GATE_RESPONSE,
        "404": CHILD_NOT_FOUND_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "patch",
    path: "/api/children/{id}",
    operation: {
      tags: ["Children"],
      summary: "Update a child profile",
      description:
        "Partial update (FR-PROF-05..06). Send only the fields that change. PIN-gated (FR-AUTH-04) — editing a profile is a parent-dashboard action.",
      parameters: [CHILD_ID_PARAM],
      requestBody: jsonRequestBody(
        "UpdateChildBody",
        // JSON Schema cannot express the `.refine()` this schema carries, and
        // zod-to-json-schema drops it silently — so it is restated here or the
        // spec would claim `{}` is a valid body.
        "Every field is optional, but **at least one must be present**: an empty object is rejected with `400 VALIDATION_FAILED` and the message `At least one field required`. That rule is a Zod refinement with no JSON Schema equivalent, so the schema below cannot show it.",
      ),
      responses: {
        "200": jsonResponse("The updated profile.", "ChildProfileResponse"),
        "400": errorResponse(
          "Zod rejected the body — including the empty-object case described above — or the path parameter.",
          ["VALIDATION_FAILED"],
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": PIN_GATE_RESPONSE,
        "404": CHILD_NOT_FOUND_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "delete",
    path: "/api/children/{id}",
    operation: {
      tags: ["Children"],
      summary: "Delete a child profile",
      description: [
        "Removes the profile and everything belonging to it (FR-PROF-07) — progress, quiz responses, rewards, streaks and screen-time settings all cascade.",
        "",
        "PIN-gated (FR-AUTH-04). This is the most destructive thing a parent can do short of deleting the account, and the client's modal gate is what stops a child, not what stops everything else.",
      ].join("\n"),
      parameters: [CHILD_ID_PARAM],
      responses: {
        "200": jsonResponse("The profile is gone.", "DeletedResponse"),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": PIN_GATE_RESPONSE,
        "404": CHILD_NOT_FOUND_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/children/{id}/activate",
    operation: {
      tags: ["Children"],
      summary: "Switch the session's active child",
      description: [
        "Sets which child the session is acting as (FR-AUTH-06), writing `activeChildProfileId` onto the session row.",
        "",
        "**Every `/api/content/*` route requires this first** — without an active child there is no grade or language to filter by, and they answer `403`.",
        "",
        "Deliberately not PIN-gated: a five-year-old handing the tablet to a sibling must not hit a parental gate, and the switch can only ever land on a profile the already-authenticated parent owns.",
      ].join("\n"),
      parameters: [CHILD_ID_PARAM],
      responses: {
        "200": jsonResponse(
          "The session is now acting as this child.",
          "ActiveChildResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "404": CHILD_NOT_FOUND_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];

/** Re-exported for the document's `description`, which lists the legal grades. */
export const DOCUMENTED_GRADE_LEVELS = GRADE_LEVELS;
