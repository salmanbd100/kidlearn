import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
} from "../components.js";
import type { RouteDoc } from "../route-doc.js";

/**
 * `routes/auth.ts` — the two routes kidlearn defines itself on `/api/auth`.
 *
 * They are registered before better-auth's wildcard in `app.ts`, because Express
 * matches in registration order and `app.all("/api/auth/{*any}")` would otherwise
 * swallow them.
 */
export const AUTH_ROUTES: RouteDoc[] = [
  {
    method: "get",
    path: "/api/auth/google",
    operation: {
      tags: ["Auth"],
      summary: "Start Google sign-in",
      description: [
        "Redirects to Google's consent screen (FR-AUTH-02).",
        "",
        "This exists as a `GET` because better-auth's own `/api/auth/sign-in/social` is `POST`-only, so a browser cannot begin the flow by following a link. The sign-in button is therefore a plain anchor to this URL, and the flow is testable by hand.",
        "",
        "The response also sets better-auth's OAuth `state` cookie, which the callback verifies — a client that drops it will fail every sign-in on the state check. The post-login destination is server configuration (`PARENT_POST_LOGIN_PATH`), not something the caller passes in.",
        "",
        "**Try it out will not work from this page**: Swagger UI follows the redirect with `fetch`, which cannot hand the browser to Google. Open the URL in a tab instead.",
      ].join("\n"),
      security: [],
      responses: {
        "302": {
          description:
            "Redirect to Google's authorization URL, with the OAuth `state` cookie attached.",
          headers: {
            Location: {
              description: "Google's authorization URL.",
              schema: { type: "string" },
            },
            "Set-Cookie": {
              description: "better-auth's OAuth `state` cookie.",
              schema: { type: "string" },
            },
          },
        },
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/auth/me",
    operation: {
      tags: ["Auth"],
      summary: "Who am I",
      description: [
        "Returns the signed-in parent and which child profile the session is acting as.",
        "",
        "Also the endpoint that **provisions** the `Parent` row on a brand-new parent's first request: kidlearn has no sign-up step, so the domain row is created lazily here. That is why this can answer `403` or `409` on a session that authenticated perfectly well.",
        "",
        "Never returns the PIN or its hash — only `hasPin`, which is what a client needs to choose between 'set a PIN' and 'enter your PIN'.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "The parent and the active child profile id (`null` until a profile is activated).",
          "AuthMeResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": errorResponse(
          "Authenticated, but not through Google — an admin signing in with credentials, for instance. Such a user is not a parent and is refused rather than provisioned a `Parent` row.",
          ["FORBIDDEN"],
        ),
        "409": errorResponse(
          "Another `Parent` row already claims this Google identity. Surfaced rather than silently reused, because reusing it would hand one identity's children to another.",
          ["CONFLICT"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];

/**
 * better-auth's own endpoints, mounted by `app.all("/api/auth/{*any}")`.
 *
 * Hand-written and deliberately **excluded from `coverage.test.ts`**: they are
 * not registrations on any router this repo owns, so the coverage walk cannot see
 * them and must not expect to. Only the four that `apps/web` will actually call
 * are documented — better-auth serves more, and its own `openAPI()` plugin is the
 * place to look for the full list if that ever becomes necessary.
 */
export const BETTER_AUTH_ROUTES: RouteDoc[] = [
  {
    method: "post",
    path: "/api/auth/sign-in/social",
    operation: {
      tags: ["Auth"],
      summary: "Start Google sign-in (better-auth, POST)",
      description:
        "Owned by better-auth, not by this codebase. Returns the authorization URL as JSON rather than redirecting. Prefer `GET /api/auth/google`, which wraps this and owns the post-login destination.",
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                provider: { type: "string", enum: ["google"] },
                callbackURL: { type: "string" },
              },
              required: ["provider"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "The authorization URL to send the browser to.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  url: { type: "string" },
                  redirect: { type: "boolean" },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    method: "get",
    path: "/api/auth/callback/google",
    operation: {
      tags: ["Auth"],
      summary: "Google OAuth callback (better-auth)",
      description:
        "Owned by better-auth. Google redirects here; better-auth verifies the `state` cookie, creates the `User`, `Account` and `Session` rows, sets the session cookie, and redirects to `callbackURL`. Not called by client code — this URL must match the Authorized redirect URI registered in the Google Cloud console exactly.",
      security: [],
      responses: {
        "302": {
          description:
            "Redirect to the post-login path, with the session cookie set.",
        },
      },
    },
  },
  {
    method: "get",
    path: "/api/auth/get-session",
    operation: {
      tags: ["Auth"],
      summary: "Read the raw session (better-auth)",
      description:
        "Owned by better-auth. Returns better-auth's own user and session objects, including the custom `activeChildProfileId` and `pinVerifiedUntil` fields. Both are `input: false` — the client cannot write them; only `POST /api/children/{id}/activate` and `POST /api/parent/pin/verify` can. Prefer `GET /api/auth/me`, which returns the kidlearn domain shape.",
      responses: {
        "200": {
          description:
            "The session, or `null` when there is no valid session cookie.",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  {
    method: "post",
    path: "/api/auth/sign-out",
    operation: {
      tags: ["Auth"],
      summary: "Sign out (better-auth)",
      description:
        "Owned by better-auth. Revokes the session and clears the cookie. The PIN grant and active child selection live on the session row, so both are dropped with it.",
      responses: {
        "200": {
          description: "The session was revoked.",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
];
