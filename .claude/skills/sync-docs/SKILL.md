---
name: sync-docs
description: Bring the top-level document/*.md files back in line with code that has changed. Invoke as /sync-docs (diffs the current branch) or /sync-docs <branch>. Use after finishing a feature, before opening a PR, or whenever a change may have made a requirement, journey, design rule or schema note untrue. Never edits document/implementation/**.
model: sonnet
---

# kidlearn Doc Sync

The seven documents under `document/` describe what kidlearn **is**. Code changes what it
**does**. This skill closes the gap that opens between them.

It exists because that gap has already cost this project once: `improvement-plan.md §3 P1-3`
catalogues nine statements in `CLAUDE.md` and the standards that had become false — including
"no test runner is configured" in a repo with 2,526 tests. A document a reader learns to
distrust stops being load-bearing, including the parts that are still correct.

---

## The one hard rule

**Never edit anything under `document/implementation/` or `document/implementation-mobile/`.**

Those are numbered specs for work already done — a build log, not a description of the present.
Rewriting one to match today's code destroys the record of what was actually asked for at the
time, and creates exactly the confusion this skill is meant to prevent. The single exception is
`00-progress-tracker.md`, which is a live status board — and even that is only touched when the
user explicitly asks.

If a change makes an implementation spec look wrong, that is **information**, not a defect to
patch. Report it; do not edit it.

---

## Step 0 — Establish the change surface

```bash
git branch --show-current
git diff dev...HEAD --stat        # fall back to main...HEAD if the branch came off main
git diff dev...HEAD
git log dev..HEAD --oneline
```

If args name a branch, diff that instead. If there is nothing ahead of the base, ask the user
what change they want the documents checked against — do not guess from the working tree alone.

Read the full diff. You cannot decide what a document should say from a file list.

---

## Step 1 — Classify what actually changed

Sort every change into these buckets. The bucket decides which documents are candidates; the
next step decides whether they are genuinely affected.

| Bucket | Looks like |
|---|---|
| **Behaviour a user can see** | A new screen, control, or flow; something moved, renamed, or removed from a surface |
| **Requirement surface** | A capability that no `FR-*` / `NFR-*` ID covers, or one that now works differently from its ID |
| **API contract** | A change under `packages/types/src/api/`, a route, or an OpenAPI path |
| **Schema** | A change to `packages/db/prisma/schema.prisma` or a migration |
| **Visual or interaction rule** | A token, a layout pattern, a motion rule, a component-placement decision |
| **Architecture** | Package boundaries, what is shared, what a package is for |
| **Internal only** | Refactors, tests, tooling, comments — no document describes these |

Most changes are **internal only**. Saying "nothing to update" is a valid and common outcome —
do not manufacture edits to look busy.

---

## Step 2 — Route to documents

| Document | Update when | Never update for |
|---|---|---|
| `project-requirement-details.md` | A capability exists that no requirement ID covers, or an ID's text no longer matches behaviour. §7 stack/layout changed. §9 deployment changed. | Implementation detail. This document says *what*, never *how*. |
| `user-journey-manual.md` | Any change to what a Student, Parent or Admin sees or taps. New screens, moved controls, changed flows, new empty/error states. | Anything a user cannot perceive. |
| `design.md` | A token changed; a layout pattern was chosen against what §6 specifies; a component-placement or animation rule changed. | A component merely *using* the existing rules correctly. |
| `database-design.md` | `schema.prisma` changed — a model, field, enum, index, cascade or migration. §11 gets the new migration row. | An API exposing an existing column. The column is already documented; what the API returns is not this document's subject. |
| `mobile-app-plan.md` | A web surface changed that §8's parity map names, or a server change lands in §7, or a phase row in §13 gains work. | Web-internal changes with no native counterpart. |
| `improvement-plan.md` | A finding is fixed (mark it, do not delete it); a decision in §5 or §6 is superseded. | The §1 baseline table — it is a **dated measurement on a named commit**. Never refresh those numbers. See "Dated snapshots" below. |
| `engineering-standards.md` | Almost never — it is an index. Its `standards/*.md` targets are governed by the `code-review` skill's rules, not this one. | Anything else. |

**Also check** `CLAUDE.md` (root) and `apps/web/AGENTS.md` — they are loaded into every session,
so a false line there does more damage per word than anywhere else.

---

## Step 3 — Verify before writing

For each candidate, **read the section you are about to change and confirm it is actually
false now.** A document that already covers the new behaviour in general terms usually needs no
edit. Grep for the terms your change introduces; a document that never mentions the area you
touched is probably not affected.

Two failure modes to avoid, in order of how often they happen:

1. **Editing something that was already right**, because the diff mentioned the same word.
2. **Rewriting prose to be about the change**, when the document is about the product. These
   documents are read by someone who was not in your session.

---

## Step 4 — Write the edits

- **Match the document's voice.** These files are written in careful British English prose with
  reasoning, not bullet fragments. `improvement-plan.md` and `user-journey-manual.md` are the
  strongest models. Do not degrade a paragraph into a changelog line.
- **Keep the diff minimal.** Edit the sentence that is wrong. Do not reformat, re-order, or
  "tidy" surrounding content — a large doc diff hides the real change from a reviewer.
- **Update Mermaid diagrams** when the flow they draw has changed. A stale diagram is worse than
  no diagram, because it looks authoritative.
- **Requirement IDs are additive.** Never renumber and never reuse a retired ID. Adding one after
  the code shipped is allowed, but say so in the row — `project-requirement-details.md §1` asks
  for the requirement first, and a reader deserves to know the order was reversed.
- **Record decisions, do not silently overwrite them.** When a shipped choice contradicts a
  documented one, the correction says what was there before, what replaced it, and why. The
  standards documents' recorded-exception style is the model: dated, bounded, honest about cost.
  `design.md §6`'s top-bar note is a worked example.
- **Cross-references stay valid.** If you change a section another document points at, follow the
  pointer and check it still lands.

### Dated snapshots

Some sections are measurements taken at a moment, not living descriptions:

- `improvement-plan.md §1` — "run from the repo root on 2026-09-04, on commit `08bb5fe`".
- Any block introduced by "Status:" plus a date, or "as of <date>".

**These are correct precisely because they are stale.** Refreshing the numbers destroys the
record. Leave them; if the drift is worth noting, append a dated line beneath rather than
editing the table in place.

---

## Step 5 — Report

Output three lists, in this order:

1. **Updated** — file, section, and the one-line reason it was false.
2. **Checked, no change needed** — file and why it was already correct. This list matters: it is
   how the user knows the sweep was real and not selective.
3. **Flagged, not edited** — anything you believe is wrong but is out of this skill's scope: an
   implementation spec contradicted by the change, a `standards/*.md` rule the code now breaks,
   a stale line you are not confident about. Say what you saw and what you did not do about it.

Never claim a document is aligned unless you read the relevant section in this session.
