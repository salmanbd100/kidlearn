import {
  INTERNAL_RESPONSE,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
} from "../components.js";
import type { RouteDoc } from "../route-doc.js";

/**
 * `routes/characters.ts` — `requireParent` guards the whole router.
 */
export const CHARACTERS_ROUTES: RouteDoc[] = [
  {
    method: "get",
    path: "/api/characters",
    operation: {
      tags: ["Characters"],
      summary: "List the starter avatars a child profile may wear",
      description: [
        "The avatars `POST /api/children` and `PATCH /api/children/{id}` accept in `avatarCharacterId` (FR-PROF-02). Call this before rendering the profile form — the ids are `Character` row ids, so a client cannot hold a static list of them.",
        "",
        "Filtered to `isDefault = true` **and** `status = published`, which is exactly the check the write routes apply. Two consequences worth stating: an unpublished character never appears here (`backend.md §4` — a draft character must not become a child's avatar), and this list can never offer an avatar that creation would reject.",
        "",
        "Not PIN-gated, deliberately: a parent reaches the profile form during first-run onboarding, before any PIN exists.",
        "",
        "`imageUrl` is `null` for every character today — the illustrated character sheet comes from the content pipeline (design.md §9) and the web client draws a placeholder keyed on `slug` until it lands. It is in the contract now so the artwork is a data change rather than a schema change.",
        "",
        "Earned characters are out of scope here; the unlock mechanics in file 24 extend this query per child rather than replacing it.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "The starter avatars, alphabetically by name so the picker's order is stable. An empty array if no default character has been published — a seeding problem, not a client error.",
          "AvatarCharacterListResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
