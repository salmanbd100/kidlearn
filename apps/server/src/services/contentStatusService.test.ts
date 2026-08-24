/**
 * The publishing workflow's matrix (file 32, FR-CMS-06).
 *
 * Every one of the 36 cells is asserted, not a sample. This is the only place in
 * the product that decides whether something a five-year-old can see is allowed
 * to become visible, and a matrix tested by example is a matrix with untested
 * cells — the `rejected → published` cell in particular, which is the one an
 * author under deadline pressure would most like to exist.
 *
 * No Prisma here: the matrix is data and the functions over it are pure, which is
 * exactly why it lives in a service rather than inside a route handler. File 37
 * extends the same function for AI-originated content.
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  assertEditable,
  assertTransition,
  CONTENT_STATUS_VALUES,
  canTransition,
  nextStatuses,
} from "./contentStatusService.js";

/**
 * The matrix restated as a set of "from → to" strings, transcribed from the table
 * in `document/implementation/32-admin-curriculum-management.md` rather than read
 * back out of `ALLOWED_TRANSITIONS`.
 *
 * Deriving the expectation from the implementation is how a matrix test passes
 * while documenting the wrong rules. This list is the spec; the test below is the
 * diff against it.
 */
const ALLOWED_CELLS = new Set([
  "draft→in_review",
  "draft→archived",
  "in_review→approved",
  "in_review→rejected",
  "in_review→draft",
  "approved→published",
  "approved→draft",
  "rejected→draft",
  "rejected→archived",
  "published→draft",
  "published→archived",
  "archived→draft",
]);

describe("canTransition", () => {
  it.each(
    CONTENT_STATUS_VALUES.flatMap((from) =>
      CONTENT_STATUS_VALUES.map((to) => ({
        from,
        to,
        isAllowed: ALLOWED_CELLS.has(`${from}→${to}`),
      })),
    ),
  )("$from → $to is allowed: $isAllowed", ({ from, to, isAllowed }) => {
    expect(canTransition(from, to)).toBe(isAllowed);
  });

  it("refuses every self-transition", () => {
    // The diagonal is `—` in the spec table, not `✅`. A no-op transition would
    // otherwise re-stamp `updatedBy` and `updatedAt` and look like a review step
    // that nobody performed.
    for (const status of CONTENT_STATUS_VALUES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("keeps rejected content at least three hops from published", () => {
    // The re-review rule (FR-CMS-06). Rejected work cannot be published by
    // undoing the rejection; it has to be reworked and reviewed again.
    expect(canTransition("rejected", "published")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
    expect(canTransition("rejected", "in_review")).toBe(false);

    const path = [
      "rejected",
      "draft",
      "in_review",
      "approved",
      "published",
    ] as const;
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("lets nothing but approved content be published", () => {
    for (const from of CONTENT_STATUS_VALUES) {
      expect(canTransition(from, "published")).toBe(from === "approved");
    }
  });

  it("reaches every status from somewhere, so nothing is a dead end", () => {
    for (const status of CONTENT_STATUS_VALUES) {
      const reachable = CONTENT_STATUS_VALUES.some((from) =>
        canTransition(from, status),
      );
      const escapable = ALLOWED_TRANSITIONS[status].length > 0;
      expect(
        { status, reachable, escapable },
        `${status} must be both reachable and escapable`,
      ).toEqual({ status, reachable: true, escapable: true });
    }
  });
});

describe("assertTransition", () => {
  it("returns quietly on a legal hop", () => {
    expect(() => assertTransition("approved", "published")).not.toThrow();
  });

  it("throws a 409 CONFLICT naming both ends of the illegal hop", () => {
    try {
      assertTransition("rejected", "published");
      expect.unreachable("assertTransition should have thrown");
    } catch (error) {
      // Narrowed by the assertions below rather than by a cast: a wrong error
      // type must fail the test, not be asserted into the right shape.
      expect(error).toMatchObject({
        statusCode: 409,
        code: "CONFLICT",
        details: {
          code: "INVALID_TRANSITION",
          from: "rejected",
          to: "published",
          allowed: ALLOWED_TRANSITIONS.rejected,
        },
      });
    }
  });

  it("throws on a self-transition", () => {
    expect(() => assertTransition("published", "published")).toThrow();
  });
});

describe("assertEditable", () => {
  it.each(
    CONTENT_STATUS_VALUES.filter((status) => status !== "published"),
  )("allows an edit at %s", (status) => {
    expect(() => assertEditable(status)).not.toThrow();
  });

  it("refuses an edit to a published row with a 409 that names the way out", () => {
    // The whole point of the guard: the matrix never sees an edit, because an
    // edit does not move the status, so a `PATCH` on a live lesson would reach a
    // child without passing a reviewer again.
    try {
      assertEditable("published");
      expect.unreachable("assertEditable should have thrown");
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 409,
        code: "CONFLICT",
        details: {
          code: "EDIT_REQUIRES_UNPUBLISH",
          status: "published",
          allowed: ALLOWED_TRANSITIONS.published,
        },
      });
    }
  });

  it("offers draft as a way out, so the refusal is actionable", () => {
    // `allowed` is what the CMS turns into a Withdraw button. If `published`
    // ever lost its hop to `draft`, a published row would become uneditable with
    // no path back, and this asserts against that rather than against the
    // matrix's current shape being merely non-empty.
    expect(ALLOWED_TRANSITIONS.published).toContain("draft");
  });
});

describe("nextStatuses", () => {
  it("returns the legal next states for a status", () => {
    expect(nextStatuses("in_review")).toEqual([
      "approved",
      "rejected",
      "draft",
    ]);
  });

  it("hands back a copy, so a caller cannot widen the matrix", () => {
    // The admin UI renders this list, and a client-side `.push()` reaching the
    // shared constant would add a transition button the server refuses — and,
    // worse, would do it for every request the process serves after.
    const returned = nextStatuses("draft");
    returned.push("published");

    expect(ALLOWED_TRANSITIONS.draft).toEqual(["in_review", "archived"]);
  });
});
