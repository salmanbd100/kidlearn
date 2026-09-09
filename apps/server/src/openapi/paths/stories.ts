import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
  VALIDATION_RESPONSE,
} from "../components.js";
import { STORY_DETAIL_EXAMPLE } from "../examples.js";
import { pathParam, type RouteDoc } from "../route-doc.js";

/**
 * `routes/stories.ts` — nested on `contentRouter` at `/stories`, so it carries the
 * same `requireParent` + `requireActiveChild` guards as the rest of
 * `/api/content/*` and can produce the same 401 and 403.
 */

const NO_ACTIVE_CHILD_RESPONSE = errorResponse(
  "No active child profile on this session. Call `POST /api/children/{id}/activate` first — there is no grade or language to filter the library by until then. Also returned when the session's active profile belongs to another parent, or has since been deleted.",
  ["FORBIDDEN"],
);

const LOCALISED = [
  "Filtered to `status = published` and the active child's `gradeLevels`, with every string resolved to their `preferredLanguage` and falling back to English (FR-STORY-05). `locale` reports which language actually supplied the text.",
  "",
  "Grade and language come **only** from the server-side child record — this API accepts no query parameters, so `?locale=bn` changes nothing (FR-PROF-03).",
].join("\n");

const WORLD_IS_A_ROW = [
  "`world` is the full world row — slug, child-facing name, `palette` and mascot — not a `jungle | ocean | space` literal. A story's characters come from the learning worlds (FR-STORY-04), and the cover is themed from the same `palette` the home screen's world tiles use, so adding a fourth world stays a database insert rather than a change to this contract (FR-WORLD-05).",
  "",
  "A published story in an **unpublished** world is invisible here and 404s on the detail endpoint: the world supplies theming a reviewer has not approved yet, and the two endpoints must agree about what exists.",
].join("\n");

const COMPLETED = [
  '`completed` is true exactly when this child has a `RewardLedger` row with `sourceType: "story_completion"` and `sourceId` set to this story — the grant the reader writes once on finishing it. There is no story-progress table: one record of the fact the child\'s stars were paid from, rather than two that can disagree.',
  "",
  "It is a badge, never a lock. Stories can be replayed without limit (FR-STORY-06), so a completed story opens exactly like an unread one and earns nothing further.",
].join("\n");

export const STORIES_ROUTES: RouteDoc[] = [
  {
    method: "get",
    path: "/api/content/stories",
    operation: {
      operationId: "listStories",
      tags: ["Stories"],
      summary: "List the child's story library",
      description: [
        `Every published story tagged for this child's grade — the whole library screen in one request (FR-STORY-01, FR-STORY-08). ${LOCALISED}`,
        "",
        WORLD_IS_A_ROW,
        "",
        COMPLETED,
        "",
        "Ordered by world slug and then by creation date. The order is deliberately stable between visits: a three-year-old navigates by where a cover *was*, and a grid that reshuffles itself is one they cannot learn.",
        "",
        "`titleAudioUrl` is the title read aloud so a pre-reader can hear what a cover says before opening it (NFR-A11Y-01). It is `null` until the voice pipeline (file 36) records one, and it falls back to English independently of `title` — a Bangla title with English narration is a normal response.",
        "",
        "`coverImageUrl` is `null` while a story has no cover art. The client renders its own placeholder; a missing illustration is never a reason to hide a story a child can otherwise read.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "The child's stories. Empty when nothing published is tagged for their grade — a library with no stories in it is not an error.",
          "StoryListResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "get",
    path: "/api/content/stories/{id}",
    operation: {
      operationId: "getStory",
      tags: ["Stories"],
      summary: "Get a story and its pages for the reader",
      description: [
        `One story with every page, ordered for reading (FR-STORY-02, FR-STORY-03). ${LOCALISED}`,
        "",
        "`pages[].pageNumber` is 1-based and contiguous, renumbered from the stored `sortOrder` — a gap left by a deleted page is not a page the reader skips.",
        "",
        "**Text and narration resolve per page and per field**, not per story. A Bangla story whose narration was only ever recorded in English reads in Bangla and is heard in English, rather than falling back wholesale to the English text. `locale` at the top level reports which language supplied `title` and `moral` only.",
        "",
        "`moral` is the story's learning theme (FR-STORY-03) and is `null` when no locale has a translated one. It deliberately does **not** fall back to the untranslated `Story.theme` column: that is an authoring label, not a sentence to read to a child.",
        "",
        WORLD_IS_A_ROW,
      ].join("\n"),
      parameters: [
        pathParam("id", "The story id. Must be a uuid.", {
          type: "string",
          format: "uuid",
        }),
      ],
      responses: {
        "200": jsonResponse(
          "The story, its world, and its pages in reading order.",
          "StoryDetailResponse",
          STORY_DETAIL_EXAMPLE,
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": NO_ACTIVE_CHILD_RESPONSE,
        "404": errorResponse(
          "No such story, **or** it is not published, **or** it is not tagged for this child's grade, **or** its world is not published. All four are the same `404`: a `403` would confirm the row exists, and an unpublished story must be indistinguishable from one that was never written (spec §7.3.4, NFR-SAFE-02).",
          ["NOT_FOUND"],
        ),
        "423": errorResponse(
          "The parental screen-time gate is shut (FR-TIME-02, FR-TIME-04). `TIME_LIMIT_REACHED` — today's allowance is used up; `OUTSIDE_WINDOW` — the clock is outside the parent's access window, and `error.details.windowStart` is the time to come back at.\n\n**No in-progress exemption, and none is needed.** The reader receives every page in this one response, so a story already open is never interrupted by the gate; only opening a new one is refused. `POST /api/progress/stories/{id}/complete` is never gated either, so a story being read can always be finished and paid for.",
          ["TIME_LIMIT_REACHED", "OUTSIDE_WINDOW"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
