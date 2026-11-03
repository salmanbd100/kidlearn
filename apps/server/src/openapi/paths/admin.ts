import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonRequestBody,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
  VALIDATION_RESPONSE,
} from "../components.js";
import { pathParam, type RouteDoc } from "../route-doc.js";

const ACCESS_TOKEN_FORBIDDEN_RESPONSE = errorResponse(
  "Authenticated, but not as an administrator — or as one with a linked Google account. Tokens are minted from a password session only.",
  ["FORBIDDEN"],
);

const ACCESS_TOKENS_INTRO =
  "Admin access tokens are the credential an AI assistant uses for `POST /mcp` (file 41, FR-AI-10). Mounted only when `MCP_ENABLED=true`. Each admin sees and revokes only their own.";

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
        "**Admin sessions last 12 hours from sign-in** — every `/api/admin/*` path, not only this one. The limit counts from the session's creation, so activity does not extend it; past it the session is revoked and the call answers `401`, which is the CMS's cue to show the login screen.",
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
  {
    method: "get",
    path: "/api/admin/access-tokens",
    operation: {
      operationId: "listAdminAccessTokens",
      tags: ["MCP"],
      summary: "List your access tokens",
      description: [
        ACCESS_TOKENS_INTRO,
        "",
        "Newest first, revoked and expired ones included so the history of what was issued stays visible. Never the secret: `prefix` is the first characters of it, enough to tell two tokens apart. `lastUsedAt` is updated at most every five minutes.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "The caller's tokens.",
          "AdminAccessTokenListResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": ACCESS_TOKEN_FORBIDDEN_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/admin/access-tokens",
    operation: {
      operationId: "createAdminAccessToken",
      tags: ["MCP"],
      summary: "Create an access token",
      description: [
        ACCESS_TOKENS_INTRO,
        "",
        "**The response carries the secret once.** Only its SHA-256 is stored, so it cannot be shown again — lose it and create another. Sent with `Cache-Control: no-store`.",
        "",
        "**Lifetime: 7 days by default, 30 at most — longer than the 12-hour admin session, deliberately.** An assistant's configuration is pasted once, and a token can do far less than a session: read curriculum names and create drafts for review, nothing under `/api`, no approval, no publishing, no parent or child data. Every `/mcp` call re-checks that the token is unrevoked and unexpired and that its admin still exists and has no linked Google account.",
      ].join("\n"),
      requestBody: jsonRequestBody("AdminAccessTokenCreateBody"),
      responses: {
        "201": jsonResponse(
          "The token, and its secret in `secret` — the only time the secret is sent.",
          "CreatedAdminAccessTokenResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": ACCESS_TOKEN_FORBIDDEN_RESPONSE,
        "409": errorResponse(
          "The caller already holds `MAX_ACTIVE_ACCESS_TOKENS` (10) unrevoked, unexpired tokens. Revoke one first.",
          ["CONFLICT"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "delete",
    path: "/api/admin/access-tokens/{id}",
    operation: {
      operationId: "revokeAdminAccessToken",
      tags: ["MCP"],
      summary: "Revoke an access token",
      description:
        "Stops the token working on the next `/mcp` call. The row is kept with `revokedAt` set, so the list still shows what was issued. Revoking a revoked token answers `200` with it unchanged.",
      parameters: [pathParam("id", "`AdminAccessToken.id`.")],
      responses: {
        "200": jsonResponse(
          "The token as it now stands.",
          "AdminAccessTokenResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": ACCESS_TOKEN_FORBIDDEN_RESPONSE,
        "404": errorResponse(
          "No token with that id belongs to the caller. Another admin's token is a `404` too: whether a credential id exists is not something to confirm to anyone else.",
          ["NOT_FOUND"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
