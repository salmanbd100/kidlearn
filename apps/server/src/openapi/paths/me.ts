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
      tags: ["Rewards"],
      summary: "Get the active child's star, coin and badge totals",
      description: [
        "What the child has earned, for the reward strip on their home screen (FR-GAM-06).",
        "",
        "**Whose totals these are is not in the request.** There is no child id on this path: `me` is the session's active profile, re-read under the signed-in parent's ownership on every call (FR-PROF-03). That is the whole reason this is its own resource rather than a path on `/api/children/{id}`.",
        "",
        "Every figure is a live aggregate over the append-only `RewardLedger` — `SUM(amount)` per reward type, never a stored counter. So a balance cannot drift from the grants that produced it, and files 29–30 can report *why* a child has the coins they have. Nothing anywhere in this API writes a total directly, and no endpoint accepts a reward amount or type (FR-GAM-08).",
        "",
        "`badgeCount` counts badge rows rather than summing their `amount`, which is a `1` that exists only because the ledger is one table. It is `0` until file 24 writes the first badge.",
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
];
