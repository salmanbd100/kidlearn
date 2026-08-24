import type { ContentStatus } from "@kidlearn/db";
import {
  ALLOWED_CONTENT_TRANSITIONS,
  CONTENT_STATUSES,
  isContentEditable,
  nextContentStatuses,
} from "@kidlearn/types";
import { ApiError } from "../lib/errors.js";

/**
 * The publishing workflow (file 32, FR-CMS-06) — one matrix, one authority.
 *
 * **Why this is a service and not a check inside the route.** Four resources
 * transition here, stories transition through it in file 35, and file 37 layers
 * the AI-review rule on top of it. Every one of those is a chance to write "can
 * this be published?" slightly differently, and the version that gets it wrong
 * puts unreviewed content in front of a five-year-old. There is exactly one
 * function that answers the question, it takes no Express types, and it is
 * testable without an HTTP layer (`backend.md §2`).
 *
 * **What the matrix encodes**, beyond the individual cells:
 *
 *  - *Publishing requires approval.* `published` is reachable from `approved` and
 *    nowhere else, so no path exists that skips a human.
 *  - *Rejection means re-review.* `rejected` leads only to `draft` or `archived`.
 *    Getting rejected work published takes `draft → in_review → approved →
 *    published` — four hops, all of them through a reviewer. An author cannot
 *    undo a rejection.
 *  - *Unpublishing is not deletion.* `published → draft` withdraws content from
 *    students immediately (file 12's queries filter `status = published`) while
 *    keeping the row and its progress history.
 *  - *The diagonal is empty.* A status cannot transition to itself: a no-op would
 *    re-stamp `updatedBy` and `updatedAt`, leaving an audit trail that claims a
 *    review step somebody never performed.
 */

/**
 * Prisma's `ContentStatus` as an array, which the generated enum object is not.
 *
 * The members come from `@kidlearn/types` rather than a third handwritten list —
 * the `satisfies` clause is what makes the borrowing safe, because a status added
 * to `schema.prisma` and not to `CONTENT_STATUSES` (or the reverse) fails
 * `pnpm typecheck` on this line.
 */
export const CONTENT_STATUS_VALUES =
  CONTENT_STATUSES satisfies readonly ContentStatus[];

/**
 * The matrix itself lives in `@kidlearn/types`, because the CMS renders its
 * transition buttons from the same table — one definition rather than a mirror
 * that can drift into offering a hop the server refuses.
 *
 * Re-typed here against Prisma's `ContentStatus` rather than re-imported as-is,
 * and that is a second guard rather than a formality: `Record<ContentStatus, …>`
 * demands a row per Prisma status, so a status added to `schema.prisma` and not
 * to `CONTENT_STATUSES` — or the reverse — fails to compile on this line.
 */
export const ALLOWED_TRANSITIONS: Record<
  ContentStatus,
  readonly ContentStatus[]
> = ALLOWED_CONTENT_TRANSITIONS;

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * The legal next states for a status, as a fresh array.
 *
 * Delegates to the shared helper rather than repeating its body: it already
 * returns a copy, for the reason its own comment gives.
 */
export function nextStatuses(from: ContentStatus): ContentStatus[] {
  return nextContentStatuses(from);
}

/**
 * Throws unless the hop is legal.
 *
 * `409`, not `400`: the request is well-formed and the target status is a real
 * one — what is wrong is the state the row happens to be in, which is a conflict
 * and may not be wrong a moment later (`backend.md §5`). `details.code` is
 * `INVALID_TRANSITION` so a client can tell this apart from the other conflicts
 * on the API, and `allowed` is included so the CMS can refresh its buttons from
 * the rejection instead of guessing.
 */
export function assertTransition(from: ContentStatus, to: ContentStatus): void {
  if (canTransition(from, to)) return;

  throw ApiError.conflict(`Invalid status transition ${from} → ${to}`, {
    code: "INVALID_TRANSITION",
    from,
    to,
    allowed: nextStatuses(from),
  });
}

/**
 * Throws unless the row's content may be rewritten — see `isContentEditable`
 * for why `published` refuses one.
 *
 * `409` for the same reason `assertTransition` uses it: the body is well formed
 * and it is the state the row happens to be in that refuses, which may not be
 * true a moment later. `details.code` is `EDIT_REQUIRES_UNPUBLISH` so a client
 * can tell it from `DUPLICATE_SLUG` on the same status code, and `allowed`
 * carries the hops that clear the way rather than leaving an admin to guess that
 * withdrawing is the first of them.
 */
export function assertEditable(status: ContentStatus): void {
  if (isContentEditable(status)) return;

  throw ApiError.conflict(
    "A published row cannot be edited — withdraw it to draft first",
    {
      code: "EDIT_REQUIRES_UNPUBLISH",
      status,
      allowed: nextStatuses(status),
    },
  );
}
