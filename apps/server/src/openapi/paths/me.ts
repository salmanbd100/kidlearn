import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
} from "../components.js";
import type { RouteDoc } from "../route-doc.js";

/**
 * `routes/me.ts` — mounted behind `requireParent` **and** `requireActiveChild`
 * in `routes/index.ts`, like `/api/content/*` and `/api/progress/*`.
 */

const NO_ACTIVE_CHILD_RESPONSE = errorResponse(
  "No active child profile on this session. Call `POST /api/children/{id}/activate` first — `/api/me` *is* the active child, so without one there is nobody to answer for. Also returned when the session's active profile belongs to another parent, or has since been deleted.",
  ["FORBIDDEN"],
);

export const ME_ROUTES: RouteDoc[] = [
  {
    method: "get",
    path: "/api/me/rewards/summary",
    operation: {
      operationId: "getRewardSummary",
      tags: ["Rewards"],
      summary: "Get the active child's star, coin and badge totals",
      description: [
        "What the child has earned, for the reward strip on their home screen (FR-GAM-06).",
        "",
        "**Whose totals these are is not in the request.** There is no child id on this path: `me` is the session's active profile, re-read under the signed-in parent's ownership on every call (FR-PROF-03). That is the whole reason this is its own resource rather than a path on `/api/children/{id}`.",
        "",
        "Every figure is a live aggregate over the append-only `RewardLedger` — `SUM(amount)` per reward type, never a stored counter. So a balance cannot drift from the grants that produced it, and files 29–30 can report *why* a child has the coins they have. Nothing anywhere in this API writes a total directly, and no endpoint accepts a reward amount or type (FR-GAM-08).",
        "",
        "`badgeCount` counts badge rows rather than summing their `amount`, which is a `1` that exists only because the ledger is one table.",
        "",
        "`currentStreak` is the stored `Streak.current` — **read, never advanced**. A streak counts days something was *finished*, so opening the home screen does not extend one, and this endpoint cannot be used to keep a flame alive. The day boundary is a calendar day in the deployment's `APP_TIMEZONE` (FR-GAM-06); nothing about it is taken from the device clock.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "The child's running totals.",
          "RewardSummaryResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/me/characters",
    operation: {
      operationId: "listActiveChildCharacters",
      tags: ["Characters"],
      summary:
        "List every character, flagged with what this child has unlocked",
      description: [
        "The avatar characters as the session's active child sees them (FR-GAM-05).",
        "",
        "**Locked characters are in the list, and that is the point.** A picker showing only what a child already has cannot show them what there is to earn, so the whole published set comes back and `isUnlocked` says which of them may be worn. The client draws a locked entry as a friendly silhouette with a small lock and refuses to select it — never as an error, and never by hiding it.",
        "",
        "`isUnlocked` is `true` for every `isDefault` character (the starter set, available from the first day) and for anything this child has earned. That is exactly the condition `PATCH /api/children/{id}` applies to `avatarCharacterId`, so nothing in this list can be offered and then rejected.",
        "",
        "Unlocking happens server-side, at completion time: `Character.unlockRule` is a JSONB blob of `{ stars?, coins?, badges? }` read against the child's ledger totals, and **all** the criteria a rule names must be met. A newly-unlocked character is also announced once, in `newCharacters` on `POST /api/progress/lessons/{id}/complete`. Nothing a client sends takes part in the decision (FR-GAM-08).",
        "",
        "Unpublished characters never appear (`backend.md §4`), and `imageUrl` is `null` until the illustrated character sheet lands (design.md §9) — the client draws a placeholder keyed on `slug` meanwhile.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "Every published character, alphabetically by name so the picker's order stays stable as characters unlock.",
          "CharacterUnlockListResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
