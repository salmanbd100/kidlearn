import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
} from "../components.js";
import type { RouteDoc } from "../route-doc.js";

/**
 * `routes/screen-time.ts` — mounted behind `requireParent` + `requireActiveChild`.
 *
 * The student half of screen-time control. The parent half — reading and writing
 * the policy itself — lives on `paths/children.ts`, because those routes are on
 * `childrenRouter` and take a child id.
 */

/** The `403` `requireActiveChild` produces on every student-surface route. */
const NO_ACTIVE_CHILD_RESPONSE = errorResponse(
  "The session has no active child profile, or the one it names belongs to another parent — deliberately the same answer (NFR-SAFE-02). Call `POST /api/children/{id}/activate` first.",
  ["FORBIDDEN"],
);

export const SCREEN_TIME_ROUTES: RouteDoc[] = [
  {
    method: "get",
    path: "/api/screen-time/status",
    operation: {
      tags: ["Screen Time"],
      summary: "May the active child start something new right now?",
      description: [
        "The student surface's own view of its allowance (FR-TIME-02, FR-TIME-04). The home screen calls it on load and again before every lesson or story tile tap, so a blocked child meets a friendly mascot screen *before* getting excited about a lesson — rather than a `423` after tapping one.",
        "",
        "**This is a hint, not the gate.** The enforcement is `423` on `GET /api/content/lessons/{id}` and `GET /api/content/stories/{id}`, computed from the same function this endpoint runs. A client that ignored `allowed: false` and navigated anyway would simply meet the refusal one screen later; a client that trusted a cached `true` cannot extend a limit, because it does not decide anything.",
        "",
        "**Not PIN-gated, deliberately.** This is a student-portal read scoped to the session's active child. Putting the parental gate in front of it would put the PIN pad between a five-year-old and their own home screen (FR-AUTH-06). It reveals a policy the parent set and minutes the server derived — nothing about what was learned, and nothing about any other child.",
        "",
        "**`hasInProgressLesson` is always `false` here.** The question is 'may I start something new', and the FR-TIME-03 exemption is about one specific lesson the caller has not named — so a child part-way through a lesson may see `allowed: false` here while `GET /api/content/lessons/{id}` for *that* lesson still answers `200`.",
        "",
        "`reason` is `null` exactly when `allowed` is `true`. `windowStart` is what the 'see you at…' screen formats; the client renders it in the child's own locale and computes nothing.",
        "",
        "All four settings fields are `null` for a child whose parent has set no limits — which is a policy, not a missing resource, so there is no 404 and no 'not configured' branch anywhere.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "The verdict, the minutes it was computed from, and the policy it was computed against.",
          "ScreenTimeStatusResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
