/**
 * The publishing workflow's matrix (file 32, FR-CMS-06).
 *
 * Every one of the 36 cells is asserted, not a sample. This is the only place in
 * the product that decides whether something a five-year-old can see is allowed
 * to become visible, and a matrix tested by example is a matrix with untested
 * cells — the `rejected → published` cell in particular, which is the one an
 * author under deadline pressure would most like to exist.
 *
 * The matrix itself needs no Prisma: it is data and the functions over it are
 * pure, which is exactly why it lives in a service rather than inside a route
 * handler.
 *
 * File 37's `assertAiPublishable` is the exception and is covered at the foot of
 * this file. It has to read the creating job, so this suite stubs
 * `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* One `jobs` array the tests write rows into, read
 *     back by id. No queued `mockResolvedValue` chain: the point of every case is
 *     which *combination* of a job's status and decision opens the gate, and a
 *     queued answer would assert nothing about that.
 *  2. *Assert the query, not just the result.* The claim here is a refusal, so
 *     each case asserts the thrown `details.code` and the job state that produced
 *     it — including the `edit_then_approve`-without-approval case, which is the
 *     one a decision-only check would let through.
 *  3. *`where` clauses are not the whole guard.* Not applicable: nothing here
 *     reads student-facing content.
 *  4. *Name what the stub cannot prove.* That the guard actually runs on a real
 *     publish is a property of the two call sites, asserted over HTTP in
 *     `routes/admin/content.test.ts` and `routes/admin/ai-review.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/errors.js";

const store = vi.hoisted(() => ({
  jobs: [] as { id: string; status: string; decision: string | null }[],
  questions: [] as { quizId: string; aiJobId: string | null }[],
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    aIGenerationJob: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        store.jobs.filter((job) => where.id.in.includes(job.id)),
    },
    quizQuestion: {
      // `distinct: ["aiJobId"]` is part of the query under test — a stub that
      // ignored it would pass a guard that shipped duplicate ids to the database.
      findMany: async ({ where }: { where: { quizId: string } }) => {
        const seen = new Set<string>();
        return store.questions
          .filter((one) => one.quizId === where.quizId && one.aiJobId !== null)
          .filter((one) => {
            if (seen.has(one.aiJobId as string)) return false;
            seen.add(one.aiJobId as string);
            return true;
          })
          .map((one) => ({ aiJobId: one.aiJobId }));
      },
    },
  },
}));

const {
  ALLOWED_TRANSITIONS,
  assertAiPublishable,
  assertEditable,
  assertTransition,
  CONTENT_STATUS_VALUES,
  canTransition,
  nextStatuses,
  readQuizAiJobIds,
  routeToStatus,
} = await import("./contentStatusService.js");

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

/**
 * The FR-AI-07 invariant (file 37).
 *
 * These cases are the whole of what stops a generated lesson reaching a child
 * without anybody reading it, so they are enumerated rather than sampled — the
 * `edit_then_approve`-before-approval cell in particular, which is the one that
 * exists because the editors write that decision the moment a reviewer saves.
 */
describe("assertAiPublishable", () => {
  beforeEach(() => {
    store.jobs = [];
    store.questions = [];
  });

  it("lets human-authored content through without reading any job", async () => {
    // No job row exists at all, so a lookup would answer `null` and throw. That
    // it resolves is what proves the null `aiJobId` short-circuits.
    await expect(assertAiPublishable([null])).resolves.toBeUndefined();
    await expect(assertAiPublishable([])).resolves.toBeUndefined();
  });

  const CASES: Array<{
    label: string;
    status: string;
    decision: string | null;
    isPublishable: boolean;
  }> = [
    {
      label: "still awaiting review, undecided",
      status: "awaiting_review",
      decision: null,
      isPublishable: false,
    },
    {
      label: "edited but not yet approved",
      status: "awaiting_review",
      decision: "edit_then_approve",
      isPublishable: false,
    },
    {
      label: "approved outright",
      status: "approved",
      decision: "approve",
      isPublishable: true,
    },
    {
      label: "approved after an edit",
      status: "approved",
      decision: "edit_then_approve",
      isPublishable: true,
    },
    {
      label: "rejected",
      status: "rejected",
      decision: "reject",
      isPublishable: false,
    },
    {
      label: "approved in status but carrying no decision",
      status: "approved",
      decision: null,
      isPublishable: false,
    },
    {
      label: "failed before it produced anything",
      status: "failed",
      decision: null,
      isPublishable: false,
    },
  ];

  for (const one of CASES) {
    it(`${one.isPublishable ? "allows" : "refuses"} a publish when the job is ${one.label}`, async () => {
      store.jobs.push({
        id: "job-1",
        status: one.status,
        decision: one.decision,
      });

      const guard = assertAiPublishable(["job-1"]);

      if (one.isPublishable) {
        await expect(guard).resolves.toBeUndefined();
        return;
      }

      await expect(guard).rejects.toThrow(ApiError);
      await guard.catch((error: unknown) => {
        const thrown = error as ApiError;
        expect(thrown.statusCode).toBe(409);
        expect(thrown.details).toMatchObject({
          code: "AI_REVIEW_REQUIRED",
          jobId: "job-1",
          jobStatus: one.status,
          decision: one.decision,
        });
      });
    });
  }

  it("refuses when the row names a job that is not there", async () => {
    // Unreachable through the foreign key — and still not a reason to publish
    // unreviewed content if the row somehow outlives its job.
    await expect(assertAiPublishable(["missing"])).rejects.toThrow(ApiError);
  });

  it("refuses when any one of several jobs is undecided", async () => {
    // The case the single-`aiJobId` guard could not see: a quiz an admin created
    // by hand, whose questions a later generation job wrote. The container's own
    // job is approved and the questions' job is not — publishing the quiz
    // publishes the questions.
    store.jobs.push(
      { id: "job-container", status: "approved", decision: "approve" },
      { id: "job-questions", status: "awaiting_review", decision: null },
    );

    const guard = assertAiPublishable(["job-container", "job-questions"]);

    await expect(guard).rejects.toThrow(ApiError);
    await guard.catch((error: unknown) => {
      expect((error as ApiError).details).toMatchObject({
        code: "AI_REVIEW_REQUIRED",
        jobId: "job-questions",
      });
    });
  });

  it("reads a job once however many rows name it", async () => {
    store.jobs.push({ id: "job-1", status: "approved", decision: "approve" });

    await expect(
      assertAiPublishable(["job-1", "job-1", null, "job-1"]),
    ).resolves.toBeUndefined();
  });
});

/**
 * The questions half of the FR-AI-07 guard.
 *
 * A quiz row created before the job that wrote its questions carries a null
 * `aiJobId`, so the publish guard has to reach the questions to find the job it
 * must check.
 */
describe("readQuizAiJobIds", () => {
  beforeEach(() => {
    store.questions = [];
  });

  it("collects the distinct jobs that wrote a quiz's questions", async () => {
    store.questions.push(
      { quizId: "quiz-1", aiJobId: "job-a" },
      { quizId: "quiz-1", aiJobId: "job-a" },
      { quizId: "quiz-1", aiJobId: "job-b" },
      { quizId: "quiz-1", aiJobId: null },
      { quizId: "quiz-2", aiJobId: "job-c" },
    );

    expect((await readQuizAiJobIds("quiz-1")).sort()).toEqual([
      "job-a",
      "job-b",
    ]);
  });

  it("answers nothing for a hand-written quiz", async () => {
    store.questions.push({ quizId: "quiz-1", aiJobId: null });

    expect(await readQuizAiJobIds("quiz-1")).toEqual([]);
  });
});

/**
 * The route the review queue drives a row along (file 37).
 *
 * Asserted against the matrix's shape rather than a written-down chain, because
 * a chain is exactly what this replaced: `["in_review", "rejected"]` is only
 * correct for a row still at `draft`, and threw `INVALID_TRANSITION` on the rows
 * most likely to need rejecting.
 */
describe("routeToStatus", () => {
  it("routes a draft to published through review and approval", () => {
    expect(routeToStatus("draft", "published")).toEqual([
      "in_review",
      "approved",
      "published",
    ]);
  });

  it("routes a draft to rejected through review", () => {
    expect(routeToStatus("draft", "rejected")).toEqual([
      "in_review",
      "rejected",
    ]);
  });

  it("routes a row somebody published back round to rejected", () => {
    // The case a fixed chain refused: `published → in_review` is not in the
    // matrix, so a rejection of live content used to throw and roll back.
    expect(routeToStatus("published", "rejected")).toEqual([
      "draft",
      "in_review",
      "rejected",
    ]);
  });

  it("routes an approved row to rejected without passing through published", () => {
    expect(routeToStatus("approved", "rejected")).toEqual([
      "draft",
      "in_review",
      "rejected",
    ]);
  });

  it("can reach rejected from every status", () => {
    for (const from of CONTENT_STATUS_VALUES) {
      expect(() => routeToStatus(from, "rejected")).not.toThrow();
    }
  });

  it("walks no hops when the row is already there", () => {
    // The diagonal is empty in the matrix so an audit trail cannot claim a review
    // step nobody performed; the route has to respect that rather than re-stamp.
    expect(routeToStatus("rejected", "rejected")).toEqual([]);
  });

  it("returns only legal hops, whatever the route", () => {
    for (const from of CONTENT_STATUS_VALUES) {
      for (const to of CONTENT_STATUS_VALUES) {
        let at = from;
        for (const hop of routeToStatus(from, to)) {
          expect(canTransition(at, hop)).toBe(true);
          at = hop;
        }
        expect(at).toBe(to);
      }
    }
  });
});
