# 37 — AI Review Queue

> **Estimated effort:** 3–4 hours
> **Depends on:** 35, 36
> **Requirement IDs:** FR-AI-07 (hard requirement), FR-CMS-05..06
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Close the human gate that FR-AI-07 makes a hard requirement: an `/admin/ai-queue` screen listing every `AIGenerationJob` in `awaiting_review` with type/age/language filters, a detail view where the admin reads generated text, listens to audio inline, previews images, and inspects the structured payload (FR-CMS-05), and exactly three decisions — approve (publish immediately per FR-CMS-06), edit-then-approve (via the file-33 editors), and reject with a mandatory reason (entities → `rejected`, never student-visible, fully logged per FR-AI-08) — plus the enforcement teeth: `assertTransition` is extended so an AI-originated row can never reach `published` without an approved job reference, no matter which code path asks.

## Context & Current State

Files 34–36 are done: every AI-created `Lesson`/`Quiz`/`QuizQuestion`/`Story`/`MediaAsset` row carries `aiJobId`; jobs sit in `awaiting_review` with `input` (admin params incl. grade/languages) and `rawOutput` (attempts, usage, parsed payload, entity refs, and for audio/image jobs the unattached asset + target refs). File 32's `content-status.ts` exposes `ALLOWED_TRANSITIONS`/`canTransition`/`assertTransition` and the generic `/transition` endpoints. File 33's editors accept content for direct editing, and the admin sidebar has an "AI Queue" entry with no page behind it. `AIGenerationJob` has `reviewerId`/`decision`/`reviewedAt` but **no field for a rejection reason** — this file adds `reviewNote String?`. Nothing currently stops an admin from manually walking an AI draft through `draft → in_review → approved → published` via the file-32 endpoints — that hole is closed here.

## Detailed Requirements

1. **Queue list (FR-CMS-05):** `GET /api/admin/ai/jobs?status=awaiting_review&type=&language=&gradeLevel=` — paginated, oldest first. `type` filters the enum; `language`/`gradeLevel` filter against the job's `input` JSON (`input: { path: ["languages"], array_contains: ... }` style Prisma JSON filters). `GET /api/admin/ai/jobs/:id` returns the job joined with its linked entities (resolved via the `aiJobId` back-relations). `GET /api/admin/ai/jobs/count` returns `{ awaitingReview: n }` for the sidebar badge.
2. **Detail view:** `/admin/ai-queue/[id]` renders per type — lesson/story/quiz: the generated text per locale side-by-side (en | bn); audio: inline `<audio controls>` for the unattached asset plus the source text it narrates; image: the rendered illustration next to its prompt and character sheet block; all types: a collapsible raw JSON inspector of `input` and `rawOutput` (FR-AI-08 visibility).
3. **Approve (FR-CMS-06 — documented decision):** `POST /api/admin/ai/jobs/:id/approve`. FR-CMS-06 says *"approved content is published immediately"*, so approval publishes in one action: in a single transaction the job is set to `{ status: "approved", decision: "approve", reviewerId, reviewedAt }`, then every linked content row is walked through the file-32 matrix `draft → in_review → approved → published` as **chained transitions, each hop validated by `assertTransition`** (the matrix stays the single authority; the queue is just a trusted driver of legal hops). For audio/image jobs, "publish" = setting the target FK (`introAudioAssetId` / `narrationAudioAssetId` / `audioAssetId` / `illustrationAssetId`) recorded in `rawOutput` — the asset becomes reachable only through its (published) parent.
4. **Approve guards:** approval is blocked with 409 if any linked quiz question still contains a `pending://` asset placeholder (file 35) or if any linked row is no longer `draft` (concurrent edit). Quizzes publish atomically with their questions (questions have no own status; the parent quiz transitions).
5. **Edit-then-approve:** the detail view's "Edit" button deep-links to the matching file-33 editor (`/admin/curriculum/quiz/[quizId]?jobId=…`, story editor, etc.) pre-filled with the draft rows. Saving while `jobId` is present records `{ decision: "edit_then_approve", reviewerId, reviewedAt }` on the job (status stays `awaiting_review`); back in the queue the action button now reads "Publish edited content" and runs the same approve flow of req. 3 (job status → `approved`, decision already `edit_then_approve` — preserved, not overwritten). Note: the enum value is `edit_then_approve` (file 06); any "edited_approved" wording in earlier drafts maps to it.
6. **Reject (FR-AI-08):** `POST /api/admin/ai/jobs/:id/reject` body `{ reason: z.string().min(10) }` (mandatory). Transaction: job `{ status: "rejected", decision: "reject", reviewNote: reason, reviewerId, reviewedAt }`; linked content rows transition `draft → in_review → rejected` (the matrix has no direct `draft → rejected` edge — document the two-hop chain in the service). Rejected rows and `rawOutput` are kept forever for audit; they are never student-visible (nothing student-facing reads non-`published`), and re-publishing them later requires both the matrix's re-review path **and** the invariant below — which a rejected job fails.
7. **Hard invariant (FR-AI-07):** extend the status service with `assertAiPublishable(model, row)` — if `row.aiJobId` is set, load the job; unless `job.decision ∈ { approve, edit_then_approve }`, throw 409 with code `AI_REVIEW_REQUIRED`. Wire it into the file-32 generic `/transition` handler for `to: "published"` (and into the queue's own approve flow, where it passes because the decision is written first in the same transaction). Result: **no code path publishes AI-originated content without a recorded review decision** — manual admin transitions included.
8. **Sidebar badge:** the `/admin` layout polls `GET /api/admin/ai/jobs/count` (60s interval) and renders the count as a badge on the AI Queue nav item; hidden when 0.
9. **Tests:** approve publishes (lesson then visible via the student API); reject never leaks (student content APIs return nothing, before and after); manual `/transition` publish of an AI draft without a decision → 409 `AI_REVIEW_REQUIRED`; decision audit completeness (`reviewerId`, `decision`, `reviewedAt`, `reviewNote` on reject); edit-then-approve preserves the `edit_then_approve` decision through publication.

## Technical Approach & Suggestions

Files to create/modify:

```
apps/server/src/services/content-status.ts            # + assertAiPublishable()
apps/server/src/services/ai/review.ts                 # approveJob() / rejectJob() transactions
apps/server/src/services/ai/review.test.ts
apps/server/src/routes/admin/ai.ts                    # + jobs list/detail/count/approve/reject
apps/server/src/routes/admin/ai-review.test.ts
apps/server/src/routes/admin/content.ts               # /transition handlers call assertAiPublishable
apps/server/src/routes/admin/content.ts (editors)     # ?jobId → record edit_then_approve on save
packages/db/prisma/migrations/<ts>_ai_job_review_note/ # reviewNote String?
apps/web/app/admin/ai-queue/page.tsx                  # filterable list
apps/web/app/admin/ai-queue/[id]/page.tsx             # detail + actions
apps/web/components/admin/json-inspector.tsx
apps/web/components/admin/reject-dialog.tsx           # reason textarea, min 10 chars
apps/web/app/admin/layout.tsx                         # sidebar badge count
apps/web/lib/admin-api.ts                              # extend
```

The invariant in `content-status.ts` (async — it must read the job):

```ts
export async function assertAiPublishable(
  row: { aiJobId: string | null }, tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  if (!row.aiJobId) return; // human-authored content: file-32 rules alone apply
  const job = await tx.aIGenerationJob.findUniqueOrThrow({ where: { id: row.aiJobId } });
  if (job.decision !== "approve" && job.decision !== "edit_then_approve") {
    throw new ApiError(409, "CONFLICT",
      "AI-generated content requires an approved review decision before publishing (FR-AI-07)",
      { code: "AI_REVIEW_REQUIRED", jobId: job.id, jobStatus: job.status, decision: job.decision });
  }
}
```

Every `/transition` handler gains, before the update when `req.body.to === "published"`: `await assertAiPublishable(row, tx)`. The approve service drives the chain with the existing primitives:

```ts
export async function approveJob(jobId: string, reviewerId: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.aIGenerationJob.findUniqueOrThrow({ where: { id: jobId } });
    if (job.status !== "awaiting_review") throw new ApiError(409, "CONFLICT", "Job is not awaiting review");
    await tx.aIGenerationJob.update({ where: { id: jobId }, data: {
      status: "approved", reviewerId, reviewedAt: new Date(),
      decision: job.decision ?? "approve",                  // preserve edit_then_approve
    }});
    for (const target of await linkedContentRows(jobId, tx)) {       // via aiJobId back-relations
      for (const to of ["in_review", "approved", "published"] as const) {
        assertTransition(target.status, to);                          // matrix stays authoritative
        if (to === "published") await assertAiPublishable(target, tx); // passes: decision set above
        target.status = (await target.update({ status: to, updatedBy: reviewerId })).status;
      }
    }
    await attachAssetsIfMediaJob(job, tx); // audio/image: set the FK recorded in rawOutput
  });
}
```

`rejectJob` mirrors it with the `["in_review", "rejected"]` chain + `reviewNote`. The detail page builds its preview from `rawOutput.parsed` (no extra fetches for text jobs) and `rawOutput.entities` ids for "open in editor" links. List filtering on JSON: `where: { status: "awaiting_review", type, input: { path: ["languages"], array_contains: [language] } }` — verify the exact Prisma JSON-filter syntax against the installed Prisma version during step 6 and adjust (`string_contains` on a serialized fallback is acceptable if needed).

## Step-by-Step Plan

1. Migration: add `reviewNote String?` to `AIGenerationJob`; `pnpm db:migrate`. (~10 min)
2. Write failing unit tests for `assertAiPublishable`: null `aiJobId` passes; job without decision throws `AI_REVIEW_REQUIRED`; `approve` and `edit_then_approve` pass; `reject` throws. Implement. (~25 min)
3. Wire `assertAiPublishable` into the file-32 `/transition` handlers; Supertest: an AI-draft lesson manually transitioned to `in_review → approved → published` gets 409 on the publish hop; a human-authored lesson still publishes. (~25 min)
4. Write failing tests for `approveJob`: lesson job → lesson + quiz published, decision/reviewer/reviewedAt set, student API now returns the lesson; `pending://` placeholder blocks with 409; audio job approval sets the translation FK. Implement `services/ai/review.ts`. (~40 min)
5. Tests + implementation for `rejectJob`: entities end `rejected` via the two-hop chain, `reviewNote` stored, student API returns nothing, reason shorter than 10 chars → 400. (~25 min)
6. Add the routes (list with filters, detail with linked entities, count, approve, reject) + Supertest incl. the JSON `language` filter. (~25 min)
7. Build `/admin/ai-queue` list (filter chips, type icons, age/language columns from `input`) and the detail page (per-type preview, inline audio, image grid, JSON inspector, three action buttons, reject dialog). (~40 min)
8. Add the sidebar badge; wire `?jobId` decision recording into the file-33 editor save paths; manual pass: generate → review → approve one job and reject another; `pnpm lint && pnpm typecheck && pnpm --filter server test && pnpm --filter web test`; update the tracker. (~30 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes, including: approve → lesson returned by `GET /api/content/lessons/:id`; reject → never returned; manual publish attempt on an undecided AI draft → 409 `AI_REVIEW_REQUIRED` (the FR-AI-07 invariant test).
- [ ] There is provably no publish path that skips review: the only two writers of `status: "published"` are the file-32 `/transition` handler (now guarded by `assertAiPublishable`) and `approveJob` (which records the decision first, same transaction) — assert via a grep-style test or code-review checklist item in the PR.
- [ ] Every decided job has `reviewerId`, `decision`, and `reviewedAt` set; rejected jobs additionally have a non-empty `reviewNote`; `rawOutput` survives rejection (FR-AI-08 audit completeness).
- [ ] Edit-then-approve: saving a file-33 editor with `?jobId` records `edit_then_approve`; publishing afterwards keeps that decision (never overwritten to `approve`).
- [ ] Approving an audio job sets exactly the FK named in `rawOutput` and the asset is reachable through its published parent; before approval it is reachable nowhere student-facing.
- [ ] A quiz containing `pending://` placeholders cannot be approved (409 with a message naming the offending questions).
- [ ] The sidebar badge shows the `awaiting_review` count and disappears at zero; queue filters by type, language, and grade level work against seeded jobs.
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.
- [ ] Every endpoint this file adds or changes is registered in `apps/server/src/openapi/paths/<resource>.ts` — request schema from the route's Zod validator, response schema authored in `packages/types/src/api/`, and **every** status code its guards and handler can produce. `apps/server/src/openapi/coverage.test.ts` passes, and each successful response is asserted in its route test with `assertContract` (file 12a, `standards/backend.md §7`).

## Out of Scope

- Generating content (34–36) — this file only judges it.
- Bulk approve/reject and reviewer assignment workflows (post-MVP; MVP is one job at a time).
- Editing AI text inline in the queue itself — editing always round-trips through the file-33 editors so validation and preview stay in one place.
- Notification emails / Slack pings when the queue grows (post-MVP).
- Production deployment of the pipeline and its env keys (file 38).
