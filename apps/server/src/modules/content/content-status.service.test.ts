/**
 * Every one of the 36 transition cells is asserted, not a sample: this decides
 * whether something a five-year-old can see may become visible, and the
 * `rejected → published` cell in particular must stay refused.
 *
 * The matrix is pure data. `assertAiPublishable` (FR-AI-07) reads the creating
 * job, so that part stubs `config/prisma.js` under the general.md §5 stub
 * exception: one `jobs` array tests write into (rule 1), refusals asserted by
 * `details.code` and job state (rule 2). That the guard runs on a real publish is
 * asserted over HTTP in `modules/admin/content/content.routes.test.ts` and
 * `modules/admin/ai/ai-review.routes.test.ts` (rule 4).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../shared/errors/errors.js";

const store = vi.hoisted(() => ({
  jobs: [] as { id: string; status: string; decision: string | null }[],
  questions: [] as {
    quizId: string;
    aiJobId: string | null;
    definition?: unknown;
  }[],
  mediaAssets: [] as { url: string; aiJobId: string | null }[],
}));

vi.mock("../../config/prisma.js", () => ({
  prisma: {
    aIGenerationJob: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        store.jobs.filter((job) => where.id.in.includes(job.id)),
    },
    quizQuestion: {
      findMany: async ({ where }: { where: { quizId: string } }) =>
        store.questions
          .filter((one) => one.quizId === where.quizId)
          .map((one) => ({ aiJobId: one.aiJobId, definition: one.definition })),
    },
    mediaAsset: {
      findMany: async ({ where }: { where: { url: { in: string[] } } }) =>
        store.mediaAssets.filter((asset) => where.url.in.includes(asset.url)),
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
  collectAssetUrls,
  readQuizGuard,
  routeToStatus,
} = await import("./content-status.service.js");

// The matrix written out by hand rather than read back from `ALLOWED_TRANSITIONS`.
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
    // The diagonal is empty: a no-op transition would re-stamp `updatedBy`/`updatedAt` and look like a review nobody performed.
    for (const status of CONTENT_STATUS_VALUES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("keeps rejected content at least three hops from published", () => {
    // Re-review rule (FR-CMS-06): rejected work must be reworked and reviewed again, not un-rejected into published.
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
      // Narrowed by the assertions below, not a cast: a wrong error type must fail the test.
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
  it.each(["draft", "rejected", "archived"] as const)(
    "allows an edit at %s",
    (status) => {
      expect(() => assertEditable(status)).not.toThrow();
    },
  );

  // An edit does not move the status, so `approved → published` would otherwise ship words the reviewer never saw.
  it.each(["in_review", "approved"] as const)(
    "refuses an edit at %s, where a review decision rides on the content",
    (status) => {
      expect(() => assertEditable(status)).toThrow(
        expect.objectContaining({
          statusCode: 409,
          details: expect.objectContaining({
            code: "EDIT_REQUIRES_UNPUBLISH",
            status,
          }),
        }),
      );
    },
  );

  it("refuses an edit to a published row with a 409 that names the way out", () => {
    // The matrix never sees an edit, so a `PATCH` on a live lesson would reach a child without re-review.
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
    // `allowed` becomes the CMS's Withdraw button: if `published` lost its hop to `draft`, a published row would be uneditable with no way back.
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
    // A client-side `.push()` reaching the shared constant would add a transition the server refuses, for every later request.
    const returned = nextStatuses("draft");
    returned.push("published");

    expect(ALLOWED_TRANSITIONS.draft).toEqual(["in_review", "archived"]);
  });
});

describe("assertAiPublishable", () => {
  beforeEach(() => {
    store.jobs = [];
    store.questions = [];
  });

  it("lets human-authored content through without reading any job", async () => {
    // No job row exists, so a lookup would answer `null` and throw; resolving proves the null `aiJobId` short-circuits.
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
    // Unreachable through the foreign key, but still not a reason to publish unreviewed content.
    await expect(assertAiPublishable(["missing"])).rejects.toThrow(ApiError);
  });

  it("refuses when any one of several jobs is undecided", async () => {
    // A hand-created quiz whose questions a later generation job wrote: the quiz's
    // own job is approved and the questions' job is not, so publishing it would publish the questions.
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

describe("readQuizGuard", () => {
  const LIBRARY_IMAGE =
    "https://res.cloudinary.com/test-cloud/image/upload/a.png";

  beforeEach(() => {
    store.questions = [];
    store.mediaAssets = [];
  });

  it("collects the distinct jobs that wrote a quiz's questions", async () => {
    store.questions.push(
      { quizId: "quiz-1", aiJobId: "job-a" },
      { quizId: "quiz-1", aiJobId: "job-a" },
      { quizId: "quiz-1", aiJobId: "job-b" },
      { quizId: "quiz-1", aiJobId: null },
      { quizId: "quiz-2", aiJobId: "job-c" },
    );

    const guard = await readQuizGuard("quiz-1");

    expect(guard.aiJobIds.sort()).toEqual(["job-a", "job-b"]);
  });

  it("answers nothing for a hand-written quiz", async () => {
    store.questions.push({ quizId: "quiz-1", aiJobId: null });

    expect(await readQuizGuard("quiz-1")).toEqual({
      aiJobIds: [],
      unregisteredUrls: [],
    });
  });

  it("answers for the job behind a library image a question links to", async () => {
    store.mediaAssets.push({ url: LIBRARY_IMAGE, aiJobId: "job-image" });
    store.questions.push({
      quizId: "quiz-1",
      aiJobId: null,
      definition: { image: { kind: "image", url: LIBRARY_IMAGE } },
    });

    expect((await readQuizGuard("quiz-1")).aiJobIds).toEqual(["job-image"]);
  });

  it("names every link the library does not hold", async () => {
    store.mediaAssets.push({ url: LIBRARY_IMAGE, aiJobId: null });
    store.questions.push({
      quizId: "quiz-1",
      aiJobId: null,
      definition: {
        options: [
          { image: { kind: "image", url: LIBRARY_IMAGE } },
          {
            image: { kind: "image", url: "https://tracker.example.com/p.png" },
          },
        ],
      },
    });

    expect((await readQuizGuard("quiz-1")).unregisteredUrls).toEqual([
      "https://tracker.example.com/p.png",
    ]);
  });
});

describe("collectAssetUrls", () => {
  it("finds a url at any depth, once each", () => {
    const urls = collectAssetUrls({
      promptAudio: {
        en: { url: "https://a/en.mp3" },
        bn: { url: "https://a/bn.mp3" },
      },
      options: [
        { image: { url: "https://a/x.png" } },
        { image: { url: "https://a/x.png" } },
      ],
      text: { en: "url", bn: "url" },
    });

    expect([...urls].sort()).toEqual([
      "https://a/bn.mp3",
      "https://a/en.mp3",
      "https://a/x.png",
    ]);
  });
});

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
    // `published → in_review` is not in the matrix, so rejecting live content used to throw and roll back.
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
    // The diagonal is empty so an audit trail cannot claim a review nobody performed; the route must not re-stamp.
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
