import type { Router } from "express";
import { describe, expect, it } from "vitest";
import { authRouter } from "../routes/auth.js";
import { charactersRouter } from "../routes/characters.js";
import { childrenRouter } from "../routes/children.js";
import { contentRouter } from "../routes/content.js";
import { healthRouter } from "../routes/health.js";
import { apiRouter } from "../routes/index.js";
import { parentRouter } from "../routes/parent.js";
import { progressRouter } from "../routes/progress.js";
import { ROUTE_DOCS } from "./paths/index.js";
import { toOpenApiPath } from "./route-doc.js";

/**
 * The drift gate.
 *
 * Documentation rots because nothing fails when it does. This walks the live
 * Express routers, diffs their registrations against the OpenAPI registry in both
 * directions, and fails the suite on any difference. So an endpoint added in a
 * later implementation file cannot ship undocumented, and a registry entry cannot
 * outlive the route it describes.
 *
 * The walk reads `layer.route.path` and `layer.route.methods`, which Express 5
 * (`router@2`) populates with the plain registration string — no `path-to-regexp`
 * reversing involved. That only holds for a router's *own* routes, which is why
 * this iterates the resource routers with known prefixes rather than trying to
 * recover mount paths from `app.router`.
 */

/**
 * Every router that serves documented routes, with the prefix `app.ts` and
 * `routes/index.ts` mount it at.
 */
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
  {
    prefix: "/api/progress",
    router: progressRouter,
    file: "paths/progress.ts",
  },
];

/** How many routers `routes/index.ts` mounts under `/api`. */
const EXPECTED_API_MOUNTS = 5;

/**
 * The shape Express 5's router exposes per registered route. Declared structurally
 * because `@types/express` does not describe `stack` — this is an introspection of
 * library internals, which is exactly why the assertion at the bottom of this file
 * exists: if the shape ever changes, that test fails loudly instead of this one
 * silently finding zero routes and passing.
 */
type RouteLayer = {
  route?: { path?: unknown; methods?: Record<string, boolean> };
  /** Present on every layer; only a mounted Router carries a `stack` of its own. */
  handle?: unknown;
};

/**
 * Joins a mount prefix to a route path.
 *
 * `router.post("/")` registers the path `/`, so a naive concatenation yields
 * `/api/children/` — a path the registry does not list and Express does not
 * distinguish. The trailing slash is dropped unless the result would be empty.
 */
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
      // Express registers an implicit HEAD alongside every GET, and `_all`
      // appears for `router.all()`. Neither is a documented operation.
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

/** Which registry file a live route ought to have been declared in. */
function registryFileFor(operation: string): string {
  const match = MOUNTS.filter(({ prefix }) =>
    prefix ? operation.includes(` ${prefix}`) : false,
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.file ?? "paths/health.ts";
}

describe("openapi coverage", () => {
  it("finds the live routes at all (guards the introspection itself)", () => {
    // If Express changes how `stack` is shaped, `operationsOf` returns nothing
    // and every other test here would pass vacuously. This is the canary.
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

  it("notices a newly mounted router under /api", () => {
    // The prefix map above is hand-maintained, so it cannot see a router someone
    // mounts on `apiRouter` without touching this file. This count is what turns
    // that blind spot into a failure with a clear cause.
    //
    // Counting layers would be wrong: `apiRouter.use("/content", requireParent,
    // requireActiveChild, contentRouter)` registers one layer per handler. Only a
    // mounted Router has a `stack` of its own, so that is what identifies one.
    const mountCount = (
      apiRouter as unknown as { stack: RouteLayer[] }
    ).stack.filter((layer) => {
      const handle = layer.handle as { stack?: unknown } | undefined;
      return !layer.route && Array.isArray(handle?.stack);
    }).length;

    expect(
      mountCount,
      "A router was mounted on apiRouter without being added to MOUNTS in this file. Add it there (and document its routes) so its endpoints are covered.",
    ).toBe(EXPECTED_API_MOUNTS);
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
