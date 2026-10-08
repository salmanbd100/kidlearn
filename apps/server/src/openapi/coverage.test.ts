import type { Router } from "express";
import { describe, expect, it } from "vitest";
import { adminRouter } from "../modules/admin/admin.routes.js";
import { adminAiRouter } from "../modules/admin/ai/ai.routes.js";
import { adminContentRouter } from "../modules/admin/content/content.routes.js";
import { adminContentEditorsRouter } from "../modules/admin/content-editors/content-editors.routes.js";
import { adminMediaRouter } from "../modules/admin/media/media.routes.js";
import { authRouter } from "../modules/auth/auth.routes.js";
import { charactersRouter } from "../modules/characters/characters.routes.js";
import { childrenRouter } from "../modules/children/children.routes.js";
import { contentRouter } from "../modules/content/content.routes.js";
import { storiesRouter } from "../modules/content/stories.routes.js";
import { eventsRouter } from "../modules/events/events.routes.js";
import { healthRouter } from "../modules/health/health.routes.js";
import { apiRouter } from "../modules/index.js";
import { jobsRouter } from "../modules/jobs/jobs.routes.js";
import { meRouter } from "../modules/me/me.routes.js";
import { parentRouter } from "../modules/parent/parent.routes.js";
import { progressRouter } from "../modules/progress/progress.routes.js";
import { screenTimeRouter } from "../modules/screen-time/screen-time.routes.js";
import { ROUTE_DOCS } from "./paths/index.js";
import { toOpenApiPath } from "./route-doc.js";

const MOUNTS: Array<{ prefix: string; router: Router; file: string }> = [
  { prefix: "", router: healthRouter, file: "paths/health.ts" },
  { prefix: "/api/auth", router: authRouter, file: "paths/auth.ts" },
  { prefix: "/api/parent", router: parentRouter, file: "paths/parent.ts" },
  {
    prefix: "/api/children",
    router: childrenRouter,
    file: "paths/children.ts",
  },
  {
    prefix: "/api/characters",
    router: charactersRouter,
    file: "paths/characters.ts",
  },
  { prefix: "/api/content", router: contentRouter, file: "paths/content.ts" },
  // Nested inside `contentRouter` to inherit its guards; the walk cannot see through nested mounts, so it is listed in its own right.
  {
    prefix: "/api/content/stories",
    router: storiesRouter,
    file: "paths/stories.ts",
  },
  {
    prefix: "/api/progress",
    router: progressRouter,
    file: "paths/progress.ts",
  },
  { prefix: "/api/events", router: eventsRouter, file: "paths/events.ts" },
  { prefix: "/api/me", router: meRouter, file: "paths/me.ts" },
  {
    prefix: "/api/screen-time",
    router: screenTimeRouter,
    file: "paths/screen-time.ts",
  },
  { prefix: "/api/admin/jobs", router: jobsRouter, file: "paths/jobs.ts" },
  { prefix: "/api/admin", router: adminRouter, file: "paths/admin.ts" },
  // Nested inside `adminRouter` for its `requireAdmin` guard, listed separately for the same reason as `storiesRouter`.
  {
    prefix: "/api/admin/content",
    router: adminContentRouter,
    file: "paths/admin-content.ts",
  },
  // A second router at the same mount path, listed separately so each surface gets its own registry file in the failure message.
  {
    prefix: "/api/admin/content",
    router: adminContentEditorsRouter,
    file: "paths/admin-editors.ts",
  },
  {
    prefix: "/api/admin/media",
    router: adminMediaRouter,
    file: "paths/admin-media.ts",
  },
  {
    prefix: "/api/admin/ai",
    router: adminAiRouter,
    file: "paths/admin-ai.ts",
  },
];

/** Routers reachable under `/api` at any depth, including those nested on `contentRouter` and `adminRouter`. */
const EXPECTED_ROUTERS_UNDER_API = 15;

/** Declared structurally because `@types/express` omits `stack`; the canary test below fails loudly if the shape changes. */
type RouteLayer = {
  route?: { path?: unknown; methods?: Record<string, boolean> };
  handle?: unknown;
};

function joinPath(prefix: string, routePath: string): string {
  const joined = `${prefix}${routePath}`.replace(/\/+$/, "");
  return joined === "" ? "/" : joined;
}

function operationsOf(router: Router, prefix: string): string[] {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  const operations: string[] = [];

  for (const layer of stack) {
    const route = layer.route;
    if (!route || typeof route.path !== "string") continue;

    for (const [method, enabled] of Object.entries(route.methods ?? {})) {
      // Express adds an implicit HEAD for every GET, and `_all` for `router.all()`; neither is a documented operation.
      if (!enabled || method === "_all" || method === "head") continue;

      const path = toOpenApiPath(joinPath(prefix, route.path));
      operations.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return operations;
}

const liveOperations = MOUNTS.flatMap(({ prefix, router }) =>
  operationsOf(router, prefix),
);

const documentedOperations = ROUTE_DOCS.map(
  ({ method, path }) => `${method.toUpperCase()} ${path}`,
);

function registryFileFor(operation: string): string {
  const match = MOUNTS.filter(({ prefix }) =>
    prefix ? operation.includes(` ${prefix}`) : false,
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.file ?? "paths/health.ts";
}

describe("openapi coverage", () => {
  it("finds the live routes at all (guards the introspection itself)", () => {
    // Canary: if `stack` changes shape, every other test here would pass vacuously.
    expect(liveOperations.length).toBeGreaterThanOrEqual(20);
    expect(liveOperations).toContain("GET /api/children/{id}");
  });

  it("documents every route the server serves", () => {
    const undocumented = liveOperations.filter(
      (operation) => !documentedOperations.includes(operation),
    );

    expect(
      undocumented,
      undocumented.length === 0
        ? ""
        : `Undocumented route(s):\n${undocumented
            .map(
              (op) =>
                `  ${op}  →  add it to src/openapi/${registryFileFor(op)}`,
            )
            .join(
              "\n",
            )}\n\nEvery endpoint must be registered in the OpenAPI document in the same change that adds it (backend.md §7).`,
    ).toEqual([]);
  });

  it("documents no route the server does not serve", () => {
    const stale = documentedOperations.filter(
      (operation) => !liveOperations.includes(operation),
    );

    expect(
      stale,
      stale.length === 0
        ? ""
        : `Stale registry entr(ies) — documented but not served:\n${stale
            .map((op) => `  ${op}`)
            .join(
              "\n",
            )}\n\nRemove them from src/openapi/paths/, or restore the route.`,
    ).toEqual([]);
  });

  it("notices a newly mounted router under /api, however deeply nested", () => {
    // The prefix map is hand-maintained; this count catches a router mounted without touching this file.
    function countRouters(router: Router): number {
      const stack = (router as unknown as { stack: RouteLayer[] }).stack;
      let count = 0;
      for (const layer of stack) {
        if (layer.route) continue;
        const handle = layer.handle as { stack?: unknown } | undefined;
        if (!Array.isArray(handle?.stack)) continue;
        // A nested router counts itself and whatever it mounts in turn.
        count += 1 + countRouters(layer.handle as Router);
      }
      return count;
    }

    expect(
      countRouters(apiRouter),
      "A router was mounted under /api without being added to MOUNTS in this file. Add it there with its full prefix (and document its routes) so its endpoints are covered.",
    ).toBe(EXPECTED_ROUTERS_UNDER_API);
  });

  it("registers no duplicate operations", () => {
    const seen = new Set<string>();
    const duplicates = documentedOperations.filter((operation) => {
      if (seen.has(operation)) return true;
      seen.add(operation);
      return false;
    });

    expect(duplicates).toEqual([]);
  });
});
