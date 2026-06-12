# 32 — Admin Curriculum Management

> **Estimated effort:** 3–4 hours
> **Depends on:** 31
> **Requirement IDs:** FR-CURR-04, FR-CMS-01, FR-CMS-06
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Give admins full CRUD over the curriculum hierarchy — Worlds, Subjects, Topics, Lessons — through zod-validated REST endpoints under `/api/admin/content/*` and a tree-style management UI at `/admin/curriculum`, including drag-to-reorder, archiving, audit fields, and a server-enforced publishing workflow (`draft → in_review → approved → published`) where publishing makes content immediately visible to students (FR-CMS-06) because every student-facing query already filters `status = published`.

## Context & Current State

File 31 is done: the server has `requireAdmin` middleware (admin sessions over the file-09 auth), and `apps/web` has an `/admin` layout with a sidebar (Curriculum / Stories / Media / Badges / AI Queue / Analytics sections), desktop-first, shadcn/ui available. From files 04–05 the Prisma models `World`, `Subject`, `Topic`, `Lesson` exist with the `ContentStatus` enum (`draft | in_review | approved | rejected | published | archived`) and integer `order` columns. File 08's `validate()` middleware, `ApiError`, and JSON envelope are the route pattern. File 12's student content API filters `status = published` at the query layer — this file never touches that filter. There are no admin content routes and no curriculum UI yet.

## Detailed Requirements

1. **CRUD endpoints (FR-CURR-04, FR-CMS-01)** under `/api/admin/content/`, all behind `requireAdmin`, all zod-validated:
   - `worlds`, `subjects`, `topics`, `lessons`: `GET` (list, with parent filter for topics/lessons), `POST` (create as `draft`), `GET /:id`, `PATCH /:id` (edit fields, never `status`).
   - Status is **only** changed via `POST /:resource/:id/transition { to: ContentStatus }` — the `PATCH` body schema must reject a `status` key (`.strict()`).
2. **Transition matrix (FR-CMS-06)** enforced server-side in one shared service. Allowed transitions:

   | From → To | `in_review` | `approved` | `rejected` | `published` | `draft` | `archived` |
   |---|---|---|---|---|---|---|
   | `draft` | ✅ submit | ❌ | ❌ | ❌ | — | ✅ archive |
   | `in_review` | — | ✅ approve | ✅ reject | ❌ | ✅ withdraw | ❌ |
   | `approved` | ❌ | — | ❌ | ✅ publish | ✅ reopen | ❌ |
   | `rejected` | ❌ | ❌ | — | ❌ | ✅ rework | ✅ archive |
   | `published` | ❌ | ❌ | ❌ | — | ✅ unpublish | ✅ archive |
   | `archived` | ❌ | ❌ | ❌ | ❌ | ✅ restore | — |

   Key rules: rejected content can never reach `published` without going back through `draft → in_review → approved` (re-review); publishing requires `approved`; any invalid transition returns `409 CONFLICT` with code `INVALID_TRANSITION`. The UI "Publish" button on an `in_review` item may chain `approve` + `publish` as two sequential transition calls — each hop is still validated server-side.
3. **Publish is immediate visibility (FR-CMS-06):** no extra flag — the moment a row is `published`, the file-12 student API returns it. Document this in the route file header comment.
4. **Reorder:** `PATCH /api/admin/content/:resource/reorder` with `{ parentId?, orderedIds: string[] }` persists the `order` column in one transaction; `orderedIds` must be exactly the set of siblings (validate count + membership).
5. **Archive** is a transition to `archived` (matrix above); archived rows disappear from student queries (not `published`) and are hidden by default in admin lists (`?includeArchived=true` to show).
6. **Audit fields:** every create/update/transition sets `updatedBy` (admin user id) and `updatedAt`. If `updatedBy String?` is missing from the file-04 schema, add it to the four models via a migration in this chunk.
7. **Lesson form (FR-CMS-01):** title per locale (en/bn), world select, grade-level multi-select (`nursery | kg1 | kg2`), intro script per locale, and the ordered step config (video asset URL per locale, `activityId`, `quizId` — selects may be empty until files 33+ provide content).
8. **UI:** `/admin/curriculum` — three-pane tree navigation Subject → Topic → Lesson, drag-to-reorder via `@dnd-kit/core`, status chips, transition buttons that only render the legal next states, create/edit dialogs.
9. **Tests:** unit tests own the transition matrix (every ✅ and ❌ cell), Supertest tests prove `PATCH` cannot change status, non-admins get 403, reorder persists, and publish→student-visible round trip works.

## Technical Approach & Suggestions

Files to create/modify:

```
apps/server/src/services/content-status.ts        # canTransition + transitionStatus
apps/server/src/services/content-status.test.ts
apps/server/src/routes/admin/content.ts            # worlds/subjects/topics/lessons routers
apps/server/src/routes/admin/content.test.ts
apps/server/src/lib/schemas/admin-content.ts       # zod request schemas
packages/db/prisma/migrations/...                  # add updatedBy if missing
apps/web/app/admin/curriculum/page.tsx             # three-pane tree
apps/web/app/admin/curriculum/lesson-form.tsx
apps/web/app/admin/curriculum/transition-buttons.tsx
apps/web/lib/admin-api.ts                          # extend with content calls
```

`content-status.ts` — keep the matrix as data so it is testable and reusable by file 37:

```ts
import type { ContentStatus } from "@kidlearn/db";
import { ApiError } from "../lib/errors";

export const ALLOWED_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  draft: ["in_review", "archived"],
  in_review: ["approved", "rejected", "draft"],
  approved: ["published", "draft"],
  rejected: ["draft", "archived"],
  published: ["draft", "archived"],
  archived: ["draft"],
};

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ContentStatus, to: ContentStatus): void {
  if (!canTransition(from, to)) {
    throw new ApiError(409, "CONFLICT", `Invalid status transition ${from} → ${to}`, {
      code: "INVALID_TRANSITION", from, to,
    });
  }
}
```

Request schemas in `admin-content.ts` (lesson shown; world/subject/topic are subsets):

```ts
import { z } from "zod";

const LocalizedTextSchema = z.object({ en: z.string().min(1), bn: z.string().min(1) });
export const GradeLevelSchema = z.enum(["nursery", "kg1", "kg2"]);

export const LessonUpsertSchema = z.object({
  title: LocalizedTextSchema,
  topicId: z.string().min(1),
  worldId: z.string().min(1),
  gradeLevels: z.array(GradeLevelSchema).min(1),
  introScript: LocalizedTextSchema,
  videoUrls: z.object({ en: z.string().url().optional(), bn: z.string().url().optional() }),
  activityId: z.string().nullable().optional(),
  quizId: z.string().nullable().optional(),
}).strict(); // no `status` key — transitions are a separate endpoint

export const TransitionSchema = z.object({
  to: z.enum(["draft", "in_review", "approved", "rejected", "published", "archived"]),
}).strict();

export const ReorderSchema = z.object({
  parentId: z.string().optional(),
  orderedIds: z.array(z.string().min(1)).min(1),
}).strict();
```

Transition route handler (one generic handler parameterised by the Prisma delegate):

```ts
router.post("/lessons/:id/transition", validate({ body: TransitionSchema }), async (req, res) => {
  const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: req.params.id } });
  assertTransition(lesson.status, req.body.to);
  const updated = await prisma.lesson.update({
    where: { id: lesson.id },
    data: { status: req.body.to, updatedBy: req.admin.id },
  });
  res.json({ data: updated });
});
```

Reorder runs inside `prisma.$transaction` mapping `orderedIds` to `order: index`; before writing, fetch sibling ids (`where: { topicId: parentId }`) and reject with `VALIDATION_FAILED` if the sets differ.

UI sketch: `page.tsx` renders `<SubjectColumn> → <TopicColumn> → <LessonColumn>`, each column a `DndContext` + `SortableContext` (from `@dnd-kit/core` / `@dnd-kit/sortable`) that PATCHes `/reorder` on drop. `transition-buttons.tsx` imports nothing server-side — it derives legal next states from a mirrored constant and the server remains the authority (a 409 surfaces as a toast). Forms use shadcn/ui `Dialog` + `Tabs` for en/bn locale fields.

## Step-by-Step Plan

1. Write failing unit tests for `canTransition` covering all 36 matrix cells (loop over the table) plus `assertTransition` throwing 409. (~20 min)
2. Implement `content-status.ts`; green. Add the `updatedBy` migration if the column is missing and run `pnpm --filter @kidlearn/db prisma migrate dev`. (~20 min)
3. Write Supertest tests for `POST /api/admin/content/subjects` (creates as `draft`, 403 without admin session, 400 on missing locale) and implement the subject + world routers with `LessonUpsertSchema`-style schemas. (~30 min)
4. Add topic + lesson routers (CRUD with parent filters); test that `PATCH /lessons/:id` with a `status` key returns 400 (`.strict()`). (~25 min)
5. Implement and test the generic transition endpoint on all four resources, including the rejected → published double-hop denial and publish-from-approved success. (~25 min)
6. Implement and test `reorder` (transaction, sibling-set validation, order persisted and returned sorted). (~20 min)
7. Build the `/admin/curriculum` three-pane UI with create/edit dialogs and the lesson form (en/bn tabs, grade multi-select, world select). (~35 min)
8. Wire drag-to-reorder + transition buttons with toasts; run `pnpm lint && pnpm typecheck && pnpm --filter server test`; manual pass: create subject → topic → lesson → submit → approve → publish, confirm it appears in the student API; update the tracker. (~25 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes, including a parameterised test asserting every cell of the transition matrix (✅ allowed, ❌ → 409 `INVALID_TRANSITION`).
- [ ] `rejected` content cannot reach `published` in fewer than three transitions (`rejected→draft→in_review→approved→published`); a direct `rejected→published` request returns 409.
- [ ] `PATCH /api/admin/content/lessons/:id` with `{ "status": "published" }` in the body returns 400 — status changes only via `/transition`.
- [ ] All `/api/admin/content/*` routes return 403 for a non-admin authenticated parent and 401 unauthenticated.
- [ ] After `POST /lessons/:id/transition {"to":"published"}`, the lesson is returned by the file-12 student content API; after `unpublish` it is not.
- [ ] Reordering three topics persists `order` 0,1,2 and subsequent `GET` returns them in that order; a reorder payload missing a sibling id returns 400.
- [ ] Every mutated row carries the acting admin's id in `updatedBy`.
- [ ] In the UI, an `in_review` lesson shows Approve/Reject/Withdraw buttons only; a `draft` lesson shows Submit/Archive only.
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.

## Out of Scope

- Media upload, attaching real video/audio assets, and the media library (file 33).
- Quiz question / activity definition / badge editors and lesson preview (file 33).
- AI-generated drafts and the rule that AI-originated content needs an approved review job before publishing — file 37 extends `assertTransition` for that.
- Story management UI (stories ride the same status service; admin story CRUD screens come with files 33/35/37 touchpoints).
- Platform analytics (file 31 delivered the basic version).
