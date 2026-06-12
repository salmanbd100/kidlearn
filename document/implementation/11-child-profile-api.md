# 11 — Child Profile API

> **Estimated effort:** 3–4 hours
> **Depends on:** 09
> **Requirement IDs:** FR-PROF-01, FR-PROF-02, FR-PROF-03 (data), FR-PROF-04 (shape), FR-PROF-05, FR-PROF-06, FR-PROF-07, NFR-SAFE-02
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Ship the complete REST surface for child profiles under `/api/children`: create (max 5 per parent, validated grade/language/avatar), list, update, delete-with-cascade, plus `POST /api/children/:id/activate` which writes `activeChildProfileId` into the session — the FR-AUTH-06 profile switch. Ownership is enforced by middleware that answers **404 (never 403)** for other parents' children so the API leaks no existence information (FR-PROF-07, NFR-SAFE-02).

## Context & Current State

File 09 is done: `requireParent` attaches `req.parent` and `req.session` (which carries `activeChildProfileId`, currently never set by anything). The `ChildProfile` Prisma model exists from file 03: `id`, `parentId`, `firstName`, `age`, `gradeLevel` (enum `nursery | kg1 | kg2`), `preferredLanguage` (enum `en | bn`), `avatarCharacterId` (FK to `Character`), timestamps; child-data tables (LessonProgress, RewardLedger, Streak, …) exist from file 06 with relations to ChildProfile. File 10 may or may not be done — this file depends only on 09, so the consent guard is integrated defensively: import `requireConsent` if present, otherwise leave a clearly-marked one-line mount point (file 10's plan already tests the combination).

## Detailed Requirements

1. **POST `/api/children`** (FR-PROF-01, FR-PROF-02): body `{ firstName, age, gradeLevel, preferredLanguage, avatarCharacterId }`. Validation: `firstName` 1–50 chars trimmed; `age` integer 3–6; `gradeLevel ∈ {nursery, kg1, kg2}`; `preferredLanguage ∈ {en, bn}`; `avatarCharacterId` must reference an existing `Character` row flagged as a starter/default-unlockable avatar — invalid id → 400 `VALIDATION_FAILED`. **Max 5 enforcement:** count inside the same transaction as the create (`tx.childProfile.count({ where: { parentId } })`) → 6th attempt fails 409 `CONFLICT` "Profile limit reached (5)". Consent guard from file 10 mounts here (FR-AUTH-03).
2. **GET `/api/children`** (FR-PROF-07): returns only `req.parent`'s children, ordered by `createdAt`. Never accepts a parent id parameter — the session is the only scope source (NFR-SAFE-02).
3. **GET `/api/children/:id`**: single profile, ownership-gated.
4. **PATCH `/api/children/:id`** (FR-PROF-05): partial body, same field validators, all optional, at least one key required (`.refine(obj => Object.keys(obj).length > 0)`). `parentId` is not patchable (schema simply has no such key; `.strict()` rejects unknown keys).
5. **DELETE `/api/children/:id`** (FR-PROF-06): removes the profile and cascades all child data (LessonProgress, QuizResponse, RewardLedger, ChildCharacter, Streak, ScreenTimeSetting, SessionEvent, WeeklyReport) via Prisma `onDelete: Cascade` relations (verify in schema; if any relation lacks it, add a migration `child_profile_cascade`). If the deleted child is the session's `activeChildProfileId`, null the session field in the same request. Returns `{ data: { deleted: true } }`.
6. **Ownership middleware (FR-PROF-07, NFR-SAFE-02):** `loadOwnedChild` — fetches by `{ id: req.params.id, parentId: req.parent.id }` in **one query**; no row → `ApiError.notFound("Child profile not found")` (404, deliberately not 403 — a 403 confirms the id exists and belongs to someone). Attaches `req.child`. Reused verbatim by files 12, 16, 23, 27, 28.
7. **POST `/api/children/:id/activate`** (FR-AUTH-06): ownership-gated; writes `activeChildProfileId = child.id` to the better-auth session (same write mechanism file 10 uses for `pinVerifiedUntil`; if implementing before file 10, update the Prisma `Session` row directly with a comment). No PIN required — switching child profiles must stay friction-free. Returns `{ data: { activeChildProfileId } }`.
8. **Response shape (FR-PROF-04 forward-compatibility):** a single serializer `toChildProfileDto(child)` returning `{ id, firstName, age, gradeLevel, preferredLanguage, avatarCharacterId, createdAt, stats: { stars: 0, coins: 0, badges: 0, currentStreak: 0 } }` — aggregate placeholders hard-coded to 0 until file 23/24 wire real ledger/streak queries into this same serializer. Never include `parentId` in responses.
9. **Tests:** full CRUD happy paths; 6th-profile 409; each field validator rejection; ownership: parent B GETs/PATCHes/DELETEs parent A's child → **404** with no distinguishing detail; activate sets the session value and a cross-parent activate → 404; unauthenticated → 401.

## Technical Approach & Suggestions

Files (under `/Users/salmanrahman/Documents/kidlearn/apps/server/`):

```
src/routes/children.ts
src/middleware/load-owned-child.ts
src/services/child-profile.ts        # create-with-limit transaction, dto serializer
src/schemas/children.ts              # Zod request schemas (route-local, NOT packages/types)
src/routes/children.test.ts
```

Request schemas are server-local because they validate HTTP bodies, not shared content payloads — `packages/types` stays reserved for cross-consumer schemas (activities/quizzes). `src/schemas/children.ts`:

```ts
import { z } from "zod";

export const GradeLevelSchema = z.enum(["nursery", "kg1", "kg2"]);
export const LanguageSchema = z.enum(["en", "bn"]);

export const CreateChildBodySchema = z.object({
  firstName: z.string().trim().min(1).max(50),
  age: z.number().int().min(3).max(6),
  gradeLevel: GradeLevelSchema,
  preferredLanguage: LanguageSchema,
  avatarCharacterId: z.string().min(1),
}).strict();

export const UpdateChildBodySchema = CreateChildBodySchema.partial()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export const ChildIdParamsSchema = z.object({ id: z.string().min(1) });
```

`src/middleware/load-owned-child.ts`:

```ts
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

export async function loadOwnedChild(req: Request, _res: Response, next: NextFunction) {
  const child = await prisma.childProfile.findFirst({
    where: { id: req.params.id, parentId: req.parent!.id },
  });
  if (!child) return next(ApiError.notFound("Child profile not found")); // 404, never 403
  req.child = child;
  next();
}
```

(Add `child?: ChildProfile` to the `Express.Request` augmentation from file 09.)

`src/services/child-profile.ts` create-with-limit:

```ts
export const MAX_CHILDREN_PER_PARENT = 5;

export async function createChildProfile(parentId: string, input: CreateChildBody) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.childProfile.count({ where: { parentId } });
    if (count >= MAX_CHILDREN_PER_PARENT)
      throw ApiError.conflict(`Profile limit reached (${MAX_CHILDREN_PER_PARENT})`);
    const avatar = await tx.character.findFirst({
      where: { id: input.avatarCharacterId, isStarter: true },
    });
    if (!avatar)
      throw new ApiError(400, "VALIDATION_FAILED", "Unknown avatar character", {
        field: "avatarCharacterId",
      });
    return tx.childProfile.create({ data: { ...input, parentId } });
  });
}
```

(If the `Character` model from file 06 uses a different starter flag — e.g. `unlockCriteria: null` means default — adapt the `where` and note it. Tests need at least one seeded Character row; create it in a test `beforeAll`.)

Router wiring in `src/routes/children.ts`:

```ts
const router = Router();
router.use(requireParent);
router.post("/", /* requireConsent (file 10) */ validate({ body: CreateChildBodySchema }), createHandler);
router.get("/", listHandler);
router.get("/:id", validate({ params: ChildIdParamsSchema }), loadOwnedChild, getHandler);
router.patch("/:id", validate({ params: ChildIdParamsSchema, body: UpdateChildBodySchema }), loadOwnedChild, patchHandler);
router.delete("/:id", validate({ params: ChildIdParamsSchema }), loadOwnedChild, deleteHandler);
router.post("/:id/activate", validate({ params: ChildIdParamsSchema }), loadOwnedChild, activateHandler);
export default router;
// app.ts: app.use("/api/children", childrenRouter)
```

`toChildProfileDto`:

```ts
export function toChildProfileDto(c: ChildProfile) {
  return {
    id: c.id, firstName: c.firstName, age: c.age,
    gradeLevel: c.gradeLevel, preferredLanguage: c.preferredLanguage,
    avatarCharacterId: c.avatarCharacterId, createdAt: c.createdAt,
    stats: { stars: 0, coins: 0, badges: 0, currentStreak: 0 }, // real values: files 23–24
  };
}
```

**Test setup:** follow whichever DB-test pattern files 08–09 established (mocked Prisma vs. test database). For ownership tests you need two parents — build a helper `authedAgentFor(parentFixture)` that mocks `auth.api.getSession` per Supertest agent. The cross-parent 404 assertions are the security-critical tests: assert status 404 **and** that the body equals the generic not-found envelope byte-for-byte (same as a truly nonexistent id) so no oracle exists.

## Step-by-Step Plan

1. Write `src/schemas/children.ts` with unit tests for every validator boundary (age 2 and 7 rejected, unknown key rejected via `.strict()`, empty PATCH rejected). (~20 min)
2. Failing Supertest specs for `POST /api/children`: 401 unauthenticated, 400 each invalid field, 201 happy path returning the dto with zeroed `stats`, no `parentId` key in body. (~25 min)
3. Implement `createChildProfile` service + route; seed a starter `Character` in test setup; make step-2 green. (~25 min)
4. TDD the 5-profile limit: create 5, assert 6th → 409 `CONFLICT`; assert count unchanged after the failed attempt (transaction). (~15 min)
5. TDD `loadOwnedChild` + `GET` list/detail: list returns only own children; parent B fetching parent A's child id → 404 identical to a random-id 404. (~25 min)
6. TDD `PATCH` (partial update persists, others untouched; cross-parent → 404) and `DELETE` (row gone; seeded `RewardLedger`/`LessonProgress` rows for that child gone via cascade — add the cascade migration if this test exposes a missing `onDelete`). (~30 min)
7. TDD `POST /:id/activate`: session's `activeChildProfileId` updated (verify via `GET /api/auth/me`); cross-parent activate → 404; delete-active-child nulls the session field. (~25 min)
8. Mount the consent-guard comment/import per file-10 status; run `pnpm lint && pnpm typecheck && pnpm --filter server test`; update the tracker. (~15 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes the full suite: CRUD, limit, validation, ownership, activation.
- [ ] Creating a 6th profile returns 409 `{ error: { code: "CONFLICT", message: "Profile limit reached (5)" } }` and leaves exactly 5 rows.
- [ ] `gradeLevel: "grade1"`, `preferredLanguage: "ar"`, `age: 7`, and an unknown `avatarCharacterId` are each rejected with 400 `VALIDATION_FAILED`.
- [ ] Parent B requesting parent A's child via GET/PATCH/DELETE/activate receives a 404 envelope **identical** to the response for a nonexistent id (asserted in tests) — no 403 anywhere on this router.
- [ ] After `POST /api/children/:id/activate`, `GET /api/auth/me` reports that `activeChildProfileId`; after deleting that child it reports `null`.
- [ ] Deleting a child removes its seeded progress/reward rows (cascade verified by test).
- [ ] Every response body contains `stats: { stars: 0, coins: 0, badges: 0, currentStreak: 0 }` and never contains `parentId`.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Out of Scope

- Consent capture itself and the PIN gate (file 10) — only the mount point for `requireConsent` is prepared here.
- Real aggregate stats in the dto — reward/streak queries land in files 23–24 inside `toChildProfileDto`.
- Grade/language-filtered content delivery that consumes `activeChildProfileId` (file 12) and the profile-picker UI (files 14–15).
- Character unlock logic and the starter-character seed catalog (file 24); screen-time settings per child (file 28).
