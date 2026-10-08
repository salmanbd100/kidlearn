---
name: upgrade-dependency
description: Upgrade one dependency across a major version in the kidlearn monorepo. Invoke as /upgrade-dependency <package> [target-version]. Reads the changelog between the pinned and target major, lists every call site, branches off dev, upgrades, runs the gates, and reports what it could not verify. Use for zod, prisma, motion, lucide-react, tailwind-merge, vitest, typescript and any other major bump Dependabot is told to ignore.
---

# kidlearn Dependency Upgrade

One package, one major, one branch. The ladder and the reasons for its order are in
the dependency-governance decision; the catalog rule is `document/standards/general.md §1`.

---

## Step 0 — Refuse to run in the wrong place

```bash
git branch --show-current
git status --short
gh run list --branch dev --workflow ci.yml --limit 1
```

Stop and say so if the tree is dirty, or if the last CI run on `dev` is red — a failure on the
upgrade branch must be the upgrade's, not something already broken.

Check the ladder: **CI → test-database harness → Prisma 7 → zod 4 → the rest.** If the package
is out of order (zod before Prisma, say), say which rung is still open and ask before going on.

---

## Step 1 — Where it is pinned

```bash
grep -n "<package>" pnpm-workspace.yaml
grep -rn --include=package.json '"<package>"' apps packages
pnpm outdated -r <package>
```

- In the `catalog:` block → bump it **there**, never in a `package.json`.
- In a single manifest → bump it in that manifest.
- In both → the catalog rule was broken; fix that first, in the same branch, and say so.

Paired packages move together: `prisma` + `@prisma/client`; `vitest` + `@vitest/coverage-v8`;
`@types/node` follows `engines.node`, not the latest release.

---

## Step 2 — Read the changelog before touching code

Read the release notes or migration guide for **every major between the pinned version and the
target** — Context7 first, the package's GitHub releases if it has nothing. Write down only the
breaking changes, each as one line.

Then find the call sites each one touches:

```bash
grep -rn "from \"<package>" apps packages --include='*.ts' --include='*.tsx' | grep -v node_modules
```

Known hotspots in this repo:

| Package | Look at |
| --- | --- |
| `zod` | every `*.schema.ts`, `packages/types/src/**`, `apps/server/src/openapi/to-json-schema.ts`, `lenient()` in `packages/types/src/versioning.ts` (uses Zod 3 internals — must be rewritten), `zod-to-json-schema` (v4 can replace it with `z.toJSONSchema()`) |
| `prisma` | `packages/db/prisma/schema.prisma`, `packages/db/src/migrations.test.ts` (the locking convention assumes migrations are not wrapped in one transaction), `withSerializationRetry` (`apps/server/src/shared/utils/`), every `*.db.test.ts` |
| `motion` | `useIsMotionReduced` in `packages/ui/src/hooks/use-reduced-motion.ts`, every kid celebration |
| `typescript` | `packages/config` tsconfig bases |

Show the list to the user before upgrading. If a breaking change has no call site, say so — that
is a finding too.

---

## Step 3 — Branch and upgrade

```bash
git switch dev && git pull --ff-only
git switch -c improve/upgrade-<package>-<major>
pnpm install
```

Fix the call sites from Step 2. Prefer the replacement the migration guide names over a
compatibility shim. A codemod is fine; review its diff like anyone else's.

---

## Step 4 — Run the gates

```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm turbo run test --force     # not the cache — the dependency changed underneath it
pnpm --filter server test:db    # for prisma, zod or anything the server imports
```

`test:db` needs `docker compose up -d postgres`. If Docker is not running, say the step was
skipped — do not leave it out of the report.

Known flake: `apps/server`'s Supertest suites time out under load. Re-run
`pnpm --filter server test` alone once before treating a timeout as real.

---

## Step 5 — Report

Stop before committing. Report, in this order:

1. **Version** — from → to, and where it was bumped.
2. **Breaking changes** and what was done about each.
3. **Gates** — each one, pass or fail, with the real output for any failure.
4. **Not verified** — anything the gates cannot see: runtime-only behaviour, animation timing,
   a bundle-size change, a generated client. Name it; do not round it up to "should be fine".

Then hand off to `/pr`.
