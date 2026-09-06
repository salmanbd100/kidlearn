import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
} from "../components.js";
import type { RouteDoc } from "../route-doc.js";

/**
 * `routes/admin/index.ts` — the administrator surface (spec §4.3, FR-CMS-01/07).
 */
export const ADMIN_ROUTES: RouteDoc[] = [
  {
    method: "get",
    path: "/api/admin/me",
    operation: {
      operationId: "getCurrentAdmin",
      tags: ["Admin"],
      summary: "Who am I (admin)",
      description: [
        "Returns the signed-in administrator. What the CMS shell calls to decide between the dashboard and the login screen, and what names the admin in the sidebar footer.",
        "",
        "**A separate principal from a parent, not a parent with extra rights** (spec §4.3). Admins and parents share one better-auth instance and one `user` table — one session store, one cookie, one CORS configuration — so what separates them is a domain row: an `AdminUser` exists for an admin's identity and never for a Google sign-in. That is why a perfectly valid parent session gets a `403` here, and why an admin session gets a `403` from `GET /api/auth/me` in return.",
        "",
        "**Never provisions anything.** Unlike `GET /api/auth/me`, which creates the `Parent` row on a first request, an admin exists only because `pnpm --filter server seed:admin` created one. A session with no matching row is a mistake, not a new account.",
        "",
        "Three fields and no more. `role` is withheld deliberately: there is one flat admin role at MVP, and publishing the column would invite a client to branch on a distinction the server does not make. `authUserId` is an internal join key.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "The signed-in administrator's id, name and email.",
          "AdminIdentityResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": errorResponse(
          "Authenticated, but no `AdminUser` row claims this identity — every Google-authenticated parent lands here. `403` rather than `404`: the session is real and the caller knows who they are; what they lack is authorisation.",
          ["FORBIDDEN"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/admin/analytics/overview",
    operation: {
      operationId: "getPlatformOverview",
      tags: ["Admin"],
      summary: "Platform counters",
      description: [
        "The four numbers the admin analytics page renders (FR-CMS-07, basic tier): households, learner profiles, lessons finished this week, and children active today.",
        "",
        "**Aggregates only, by design.** Nothing on this response names a parent, a child or a household, which is what makes the page safe in front of an internal reviewer who has no relationship with any of them (NFR-SAFE-02). `dauToday` counts *distinct children*, not events — it is a `GROUP BY childId`, so the database returns one row per child and no other column is read.",
        "",
        "**No parameters — not a range, not a date.** Both windows are derived from the server clock and `APP_TIMEZONE` using the same `learningTimeWindow` the parent dashboard and the weekly report use, so the platform's idea of where a day or a Monday-start week begins cannot drift from a household's. There is also no input for a caller to widen the query with.",
        "",
        "`generatedAt` exists because the page has a refresh button and nothing else on it moves: without it a reviewer cannot tell a quiet platform from a stale tab.",
        "",
        "Detailed analytics — per-subject usage, retention curves, charts — are Phase 2 per FR-CMS-07.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "Platform totals and the two windowed counts, with the instant they were read.",
          "PlatformOverviewResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": errorResponse(
          "Authenticated, but not an administrator. See `GET /api/admin/me`.",
          ["FORBIDDEN"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
