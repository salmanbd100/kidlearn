import type { RouteDoc } from "../route-doc.js";
import { AUTH_ROUTES, BETTER_AUTH_ROUTES } from "./auth.js";
import { CHARACTERS_ROUTES } from "./characters.js";
import { CHILDREN_ROUTES } from "./children.js";
import { CONTENT_ROUTES } from "./content.js";
import { HEALTH_ROUTES } from "./health.js";
import { ME_ROUTES } from "./me.js";
import { PARENT_ROUTES } from "./parent.js";
import { PROGRESS_ROUTES } from "./progress.js";

/**
 * The registry: every documented operation, one entry per route.
 *
 * **Adding an endpoint means adding an entry here.** `coverage.test.ts` diffs this
 * list against what the Express routers actually register, in both directions, so
 * a new route without an entry fails `pnpm --filter server test` — and so does an
 * entry left behind by a deleted route.
 */
export const ROUTE_DOCS: RouteDoc[] = [
  ...HEALTH_ROUTES,
  ...AUTH_ROUTES,
  ...PARENT_ROUTES,
  ...CHILDREN_ROUTES,
  ...CHARACTERS_ROUTES,
  ...CONTENT_ROUTES,
  ...PROGRESS_ROUTES,
  ...ME_ROUTES,
];

/**
 * Operations served by better-auth's `app.all("/api/auth/{*any}")` catch-all.
 *
 * Kept separate from `ROUTE_DOCS` because the coverage test walks routers this
 * repo owns, and these are registrations inside better-auth. Including them there
 * would make the test demand routes it cannot see and fail permanently.
 */
export const EXTERNAL_ROUTE_DOCS: RouteDoc[] = [...BETTER_AUTH_ROUTES];

/** Everything the document publishes. */
export const ALL_ROUTE_DOCS: RouteDoc[] = [
  ...ROUTE_DOCS,
  ...EXTERNAL_ROUTE_DOCS,
];
