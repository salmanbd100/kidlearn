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
import { pathParam, type RouteDoc } from "../route-doc.js";

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
