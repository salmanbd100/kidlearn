/**
 * The human gate (file 37, FR-AI-07, FR-AI-08, FR-CMS-05..06).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* One array per table, and every write lands in
 *     it. Each assertion reads back the row the service moved rather than a value
 *     queued in advance, which is what makes "the lesson is now `published` and
 *     the quiz went with it" a claim about behaviour rather than about a mock.
 *  2. *Assert the query, not just the result.* The central claims here are about
 *     status, so they are read off the stored rows — and the negative one, that a
 *     rejected job leaves nothing at `published`, is asserted over the whole
 *     store rather than over the return value.
 *  3. *`where` clauses are not the whole guard.* Not applicable directly: nothing
 *     here reads student-facing content. That a `rejected` row cannot reach a
 *     child is a property of the student API's filter, asserted in
 *     `routes/content.test.ts` and `routes/stories.test.ts`; what this file
 *     proves is that the row lands on `rejected` in the first place.
 *  4. *Name what the stub cannot prove.* Two things. Atomicity is Postgres's:
 *     the stub runs the `$transaction` callback directly and rethrows, so a
 *     failure mid-chain is asserted as "the job was not decided" rather than as a
 *     rollback. And Serializable isolation is asserted against the options passed
 *     to `$transaction`, matching `children.test.ts`, rather than by racing two
 *     callers.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/errors.js";
import { PLACEHOLDER_ASSET_HOST } from "./placeholder-assets.js";

type Row = Record<string, unknown> & { id: string };

const store = vi.hoisted(() => ({
  jobs: [] as Row[],
  lessons: [] as Row[],
  quizzes: [] as Row[],
  questions: [] as Row[],
  activities: [] as Row[],
  stories: [] as Row[],
  mediaAssets: [] as Row[],
  lessonTranslations: [] as Row[],
  storyPageTranslations: [] as Row[],
  quizQuestionTranslations: [] as Row[],
  storyPages: [] as Row[],
  /** Every `$transaction` option object, so the isolation level is checkable. */
  transactions: [] as unknown[],
}));

vi.mock("../../lib/prisma.js", () => {
  // `{ id: { in: [...] } }` and `{ aiJobId: { not: null } }` are the two Prisma
  // filter objects file 37 uses; everything else in these suites is equality.
  function matches(row: Row, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        const filter = value as Record<string, unknown>;
        if ("in" in filter) return (filter.in as unknown[]).includes(row[key]);
        if ("not" in filter) return row[key] !== filter.not;
      }
      return row[key] === value;
    });
  }

  function table(rows: () => Row[]) {
    return {
      findMany: async ({ where = {} }: { where?: Record<string, unknown> }) =>
        rows().filter((row) => matches(row, where)),
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        rows().find((row) => matches(row, where)) ?? null,
      findUniqueOrThrow: async ({
        where,
      }: {
        where: Record<string, unknown>;
      }) => {
        const found = rows().find((row) => matches(row, where));
        if (!found) throw new Error("not found");
        return found;
      },
      update: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const found = rows().find((row) => matches(row, where));
        if (!found) throw new Error("not found");
        Object.assign(found, data);
        return found;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const found = rows().filter((row) => matches(row, where));
        for (const row of found) Object.assign(row, data);
        return { count: found.length };
      },
      count: async ({ where = {} }: { where?: Record<string, unknown> }) =>
        rows().filter((row) => matches(row, where)).length,
    };
  }

  /**
   * The three translation tables address rows by a compound unique key, which
   * the generic `matches` above cannot express — so they get their own lookup
   * that unpacks it. This is exactly the `(targetId, locale)` pair file 36
   * records and file 37 writes against.
   */
  function translationTable(rows: () => Row[], parentKey: string) {
    const find = (where: Record<string, unknown>) => {
      const compound = Object.values(where)[0] as Record<string, unknown>;
      return rows().find(
        (row) =>
          row[parentKey] === compound[parentKey] &&
          row.language === compound.language,
      );
    };

    return {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        find(where) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const found = find(where);
        if (!found) throw new Error("translation row not found");
        Object.assign(found, data);
        return found;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: Record<string, unknown>;
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const found = find(where);
        if (found) {
          Object.assign(found, update);
          return found;
        }
        const row: Row = { id: `translation-${rows().length + 1}`, ...create };
        rows().push(row);
        return row;
      },
    };
  }

  const client = {
    aIGenerationJob: table(() => store.jobs),
    lesson: table(() => store.lessons),
    quiz: table(() => store.quizzes),
    activity: table(() => store.activities),
    story: table(() => store.stories),
    storyPage: table(() => store.storyPages),
    mediaAsset: table(() => store.mediaAssets),
    quizQuestion: {
      ...table(() => store.questions),
      // `linkedContentRows` selects the parent quiz through the relation, which
      // the generic table cannot resolve — the join is done here instead. The
      // projection is built from `select` rather than assumed, because the three
      // callers ask for three different shapes and `readQuizAiJobIds` also asks
      // for `distinct`.
      findMany: async ({
        where = {},
        select,
        distinct,
      }: {
        where?: Record<string, unknown>;
        select?: Record<string, unknown>;
        distinct?: string[];
      }) => {
        let rows = store.questions.filter((row) => matches(row, where));

        if (distinct !== undefined) {
          const seen = new Set<string>();
          rows = rows.filter((row) => {
            const key = distinct.map((field) => String(row[field])).join("|");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }

        if (select === undefined) return rows;

        return rows.map((row) => {
          const projected: Record<string, unknown> = {};
          for (const [key, wanted] of Object.entries(select)) {
            if (key === "quiz") {
              projected.quiz = store.quizzes.find(
                (quiz) => quiz.id === row.quizId,
              );
            } else if (wanted) {
              projected[key] = row[key];
            }
          }
          return projected;
        });
      },
    },
    lessonTranslation: translationTable(
      () => store.lessonTranslations,
      "lessonId",
    ),
    storyPageTranslation: translationTable(
      () => store.storyPageTranslations,
      "storyPageId",
    ),
    quizQuestionTranslation: translationTable(
      () => store.quizQuestionTranslations,
      "questionId",
    ),
  };

  return {
    prisma: {
      ...client,
      $transaction: async (
        run: (tx: typeof client) => Promise<unknown>,
        options?: unknown,
      ) => {
        store.transactions.push(options);
        return run(client);
      },
    },
  };
});

const {
  approveJob,
  countAwaitingReview,
  getJob,
  listJobs,
  recordEditDecision,
  rejectJob,
} = await import("./review.js");

const REVIEWER = "admin-1";

/**
 * Awaits a call expected to throw and hands back the `ApiError`.
 *
 * Narrowed here rather than at each call site: `.catch()` widens the result to
 * the union of the resolved value and the caught one, and asserting on
 * `error.statusCode` against that union is a compile error every case would
 * otherwise have to cast its way out of.
 */
async function expectRejection(work: Promise<unknown>): Promise<ApiError> {
  try {
    await work;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("Expected the call to be refused, but it resolved.");
}

function seedLessonJob(
  overrides: {
    jobStatus?: string;
    decision?: string | null;
    lessonStatus?: string;
    quizStatus?: string;
    questionDefinition?: unknown;
  } = {},
): string {
  store.jobs.push({
    id: "job-lesson",
    type: "lesson",
    status: overrides.jobStatus ?? "awaiting_review",
    decision: overrides.decision ?? null,
    input: {
      gradeLevel: "KG1",
      languages: ["en", "bn"],
      lessonFocus: "The letter A",
    },
    rawOutput: { attempts: [{ attempt: 1 }] },
    reviewerId: null,
    reviewNote: null,
    createdAt: new Date("2026-09-01T09:00:00.000Z"),
    updatedAt: new Date("2026-09-01T09:00:00.000Z"),
    reviewedAt: null,
  });
  store.lessons.push({
    id: "lesson-1",
    title: "The letter A",
    status: overrides.lessonStatus ?? "draft",
    aiJobId: "job-lesson",
    createdAt: new Date(),
  });
  store.quizzes.push({
    id: "quiz-1",
    title: "The letter A",
    status: overrides.quizStatus ?? "draft",
    aiJobId: "job-lesson",
    createdAt: new Date(),
  });
  store.questions.push({
    id: "question-1",
    quizId: "quiz-1",
    sortOrder: 1,
    aiJobId: "job-lesson",
    definition: overrides.questionDefinition ?? {
      type: "mcq",
      prompt: { en: "Which is A?", bn: "কোনটি A?" },
    },
  });
  return "job-lesson";
}

function seedNarrationJob(): string {
  store.jobs.push({
    id: "job-audio",
    type: "audio",
    status: "awaiting_review",
    decision: null,
    input: {
      entity: "lesson",
      entityId: "lesson-9",
      targetTable: "LessonTranslation",
      targetId: "lesson-9",
      locale: "bn",
      text: "চলো A শিখি",
    },
    rawOutput: {},
    reviewerId: null,
    reviewNote: null,
    createdAt: new Date("2026-09-02T09:00:00.000Z"),
    updatedAt: new Date("2026-09-02T09:00:00.000Z"),
    reviewedAt: null,
  });
  store.mediaAssets.push({
    id: "asset-1",
    url: "https://cdn.example.test/clip.mp3",
    kind: "audio",
    language: "bn",
    aiJobId: "job-audio",
    createdAt: new Date(),
  });
  store.lessonTranslations.push({
    id: "translation-1",
    lessonId: "lesson-9",
    language: "bn",
    introScript: "চলো A শিখি",
    introAudioAssetId: null,
  });
  return "job-audio";
}

function resetStore(): void {
  store.jobs = [];
  store.lessons = [];
  store.quizzes = [];
  store.questions = [];
  store.activities = [];
  store.stories = [];
  store.mediaAssets = [];
  store.lessonTranslations = [];
  store.storyPageTranslations = [];
  store.quizQuestionTranslations = [];
  store.storyPages = [];
  store.transactions = [];
}

beforeEach(resetStore);

describe("approveJob", () => {
  it("publishes every row the job created, and records who decided", async () => {
    const jobId = seedLessonJob();

    const result = await approveJob(jobId, REVIEWER);

    expect(store.lessons[0].status).toBe("published");
    expect(store.quizzes[0].status).toBe("published");
    expect(store.jobs[0]).toMatchObject({
      status: "approved",
      decision: "approve",
      reviewerId: REVIEWER,
    });
    expect(store.jobs[0].reviewedAt).toBeInstanceOf(Date);
    expect(result.publishedEntities.map((one) => one.id)).toEqual([
      "lesson-1",
      "quiz-1",
    ]);
  });

  it("stamps the reviewer on the lesson's own audit column", async () => {
    // `Lesson` is the only linked table carrying `updatedBy` (file 32); the
    // others record this decision through the job's `reviewerId` instead.
    const jobId = seedLessonJob();

    await approveJob(jobId, REVIEWER);

    expect(store.lessons[0].updatedBy).toBe(REVIEWER);
  });

  it("preserves an edit_then_approve decision rather than overwriting it", async () => {
    // The only record that the words which went live are not the words the model
    // wrote. Overwriting it to "approve" loses that permanently (FR-AI-08).
    const jobId = seedLessonJob({ decision: "edit_then_approve" });

    await approveJob(jobId, REVIEWER);

    expect(store.jobs[0].decision).toBe("edit_then_approve");
    expect(store.jobs[0].status).toBe("approved");
    expect(store.lessons[0].status).toBe("published");
  });

  it("publishes the parent quiz of generated questions even when the quiz predates the job", async () => {
    // A quiz generated against a lesson that already had one stamps `aiJobId` on
    // the questions only. A question has no status, so approving it means
    // publishing the quiz it belongs to — or the questions go live invisibly.
    store.jobs.push({
      id: "job-quiz",
      type: "quiz",
      status: "awaiting_review",
      decision: null,
      input: { languages: ["en"] },
      rawOutput: {},
      reviewerId: null,
      reviewNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedAt: null,
    });
    store.quizzes.push({
      id: "quiz-hand",
      title: "Hand-written",
      status: "draft",
      aiJobId: null,
      createdAt: new Date(),
    });
    store.questions.push({
      id: "question-9",
      quizId: "quiz-hand",
      sortOrder: 3,
      aiJobId: "job-quiz",
      definition: { type: "mcq", prompt: { en: "?", bn: "?" } },
    });

    await approveJob("job-quiz", REVIEWER);

    expect(store.quizzes[0].status).toBe("published");
  });

  it("refuses a quiz question still holding a generated placeholder asset", async () => {
    const jobId = seedLessonJob({
      questionDefinition: {
        type: "picture_selection",
        options: [{ image: { url: `${PLACEHOLDER_ASSET_HOST}/a.png` } }],
      },
    });

    await expect(approveJob(jobId, REVIEWER)).rejects.toThrow(ApiError);

    expect(store.lessons[0].status).toBe("draft");
    expect(store.jobs[0].status).toBe("awaiting_review");
  });

  it("names the offending question in the refusal", async () => {
    const jobId = seedLessonJob({
      questionDefinition: {
        type: "mcq",
        promptAudio: { en: `${PLACEHOLDER_ASSET_HOST}/clip.mp3` },
      },
    });

    const error = await expectRejection(approveJob(jobId, REVIEWER));

    expect(error.statusCode).toBe(409);
    expect(error.details).toMatchObject({ code: "APPROVAL_BLOCKED" });
    expect(JSON.stringify(error.details)).toContain("Question 1");
  });

  it("refuses when a linked row has been moved off draft since generation", async () => {
    const jobId = seedLessonJob({ lessonStatus: "archived" });

    const error = await expectRejection(approveJob(jobId, REVIEWER));

    expect(error.statusCode).toBe(409);
    expect(JSON.stringify(error.details)).toContain("archived");
    expect(store.jobs[0].status).toBe("awaiting_review");
  });

  it("refuses a job that is not awaiting review", async () => {
    const jobId = seedLessonJob({ jobStatus: "approved" });

    const error = await expectRejection(approveJob(jobId, REVIEWER));

    expect(error.statusCode).toBe(409);
    expect(error.details).toMatchObject({ code: "JOB_NOT_AWAITING_REVIEW" });
  });

  it("404s an unknown job", async () => {
    await expect(approveJob("nope", REVIEWER)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("returns a payload with no blockers, so the screen shows a success and not a warning", async () => {
    // `finish` rebuilds the detail *after* the decision lands, so a blocker
    // computed from "this job is not awaiting review" would come back on every
    // successful approval — and the review screen renders those as a `role="alert"`
    // "This cannot be approved yet" box, directly beneath its own success notice.
    const jobId = seedLessonJob();

    const result = await approveJob(jobId, REVIEWER);

    expect(result.job.status).toBe("approved");
    expect(result.job.blockers).toEqual([]);
  });

  it("runs at Serializable isolation", async () => {
    // Two admins deciding the same job at once must not both read
    // `awaiting_review`. The stub cannot race them, so the guarantee is asserted
    // against the level requested — same approach as `children.test.ts`.
    await approveJob(seedLessonJob(), REVIEWER);

    expect(store.transactions[0]).toMatchObject({
      isolationLevel: "Serializable",
    });
  });

  it("attaches an audio job's asset to the foreign key the generation recorded", async () => {
    // This is what "publish" means for a media job: the clip has no status and no
    // student query of its own, so writing the key is the moment it becomes
    // reachable — and only through its published parent (FR-CMS-05).
    const jobId = seedNarrationJob();

    const result = await approveJob(jobId, REVIEWER);

    expect(store.lessonTranslations[0].introAudioAssetId).toBe("asset-1");
    expect(result.attachedAssetIds).toEqual(["asset-1"]);
  });

  it("creates the quiz question translation row when the clip's target has none", async () => {
    // A `QuizQuestionTranslation` exists only once a question gains audio, so the
    // attachment upserts rather than updating an id that may not be there.
    store.jobs.push({
      id: "job-quiz-audio",
      type: "audio",
      status: "awaiting_review",
      decision: null,
      input: {
        entity: "quiz",
        entityId: "quiz-5",
        targetTable: "QuizQuestionTranslation",
        targetId: "question-5",
        locale: "en",
        text: "Which is A?",
      },
      rawOutput: {},
      reviewerId: null,
      reviewNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedAt: null,
    });
    store.mediaAssets.push({
      id: "asset-2",
      url: "https://cdn.example.test/q.mp3",
      kind: "audio",
      language: "en",
      aiJobId: "job-quiz-audio",
      createdAt: new Date(),
    });

    await approveJob("job-quiz-audio", REVIEWER);

    expect(store.quizQuestionTranslations).toHaveLength(1);
    expect(store.quizQuestionTranslations[0]).toMatchObject({
      questionId: "question-5",
      language: "en",
      audioAssetId: "asset-2",
    });
  });
});

describe("rejectJob", () => {
  const REASON = "The Bangla script reads as a translation, not as speech.";

  it("walks every linked row to rejected through in_review", async () => {
    // The matrix has no `draft → rejected` edge, so the chain goes through
    // review. Both hops are real transitions.
    const jobId = seedLessonJob();

    const result = await rejectJob(jobId, REVIEWER, REASON);

    expect(store.lessons[0].status).toBe("rejected");
    expect(store.quizzes[0].status).toBe("rejected");
    expect(result.rejectedEntities.map((one) => one.status)).toEqual([
      "rejected",
      "rejected",
    ]);
  });

  it("records the reason and the whole decision audit", async () => {
    const jobId = seedLessonJob();

    await rejectJob(jobId, REVIEWER, REASON);

    expect(store.jobs[0]).toMatchObject({
      status: "rejected",
      decision: "reject",
      reviewNote: REASON,
      reviewerId: REVIEWER,
    });
    expect(store.jobs[0].reviewedAt).toBeInstanceOf(Date);
  });

  it("keeps rawOutput, so a rejected generation stays diagnosable", async () => {
    // FR-AI-08: a rejection is the case where knowing exactly what the model was
    // asked and exactly what it said matters most.
    const jobId = seedLessonJob();

    await rejectJob(jobId, REVIEWER, REASON);

    expect(store.jobs[0].rawOutput).toEqual({ attempts: [{ attempt: 1 }] });
  });

  it("leaves nothing anywhere at published", async () => {
    const jobId = seedLessonJob();

    await rejectJob(jobId, REVIEWER, REASON);

    const everyStatus = [...store.lessons, ...store.quizzes].map(
      (row) => row.status,
    );
    expect(everyStatus).not.toContain("published");
  });

  it("attaches no media", async () => {
    // A rejected clip must stay unreachable: nothing points at it, which is the
    // only thing keeping it out of a lesson a child plays.
    const jobId = seedNarrationJob();

    const result = await rejectJob(jobId, REVIEWER, REASON);

    expect(store.lessonTranslations[0].introAudioAssetId).toBeNull();
    expect(result.attachedAssetIds).toEqual([]);
  });

  it("refuses a job that is not awaiting review", async () => {
    const jobId = seedLessonJob({ jobStatus: "rejected" });

    await expect(rejectJob(jobId, REVIEWER, REASON)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("rejects a row somebody published by hand, routing it round through draft", async () => {
    // The matrix has no `published → in_review` edge. A fixed two-hop chain threw
    // `INVALID_TRANSITION` here and rolled the whole rejection back, so the job
    // whose content was actually live was the one job that could not be rejected.
    const jobId = seedLessonJob({
      lessonStatus: "published",
      quizStatus: "approved",
    });

    const result = await rejectJob(jobId, REVIEWER, REASON);

    expect(store.lessons[0].status).toBe("rejected");
    expect(store.quizzes[0].status).toBe("rejected");
    expect(result.rejectedEntities.map((one) => one.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(store.jobs[0].status).toBe("rejected");
  });

  it("rejects from every status a linked row can be sitting in", async () => {
    for (const lessonStatus of [
      "draft",
      "in_review",
      "approved",
      "published",
      "archived",
      "rejected",
    ]) {
      resetStore();
      const jobId = seedLessonJob({ lessonStatus });

      await rejectJob(jobId, REVIEWER, REASON);

      expect(store.lessons[0].status).toBe("rejected");
    }
  });
});

describe("recordEditDecision", () => {
  it("records edit_then_approve on a job still awaiting review", async () => {
    const jobId = seedLessonJob();

    await recordEditDecision(jobId, REVIEWER);

    expect(store.jobs[0]).toMatchObject({
      decision: "edit_then_approve",
      reviewerId: REVIEWER,
      status: "awaiting_review",
    });
  });

  it("leaves reviewedAt unset, because an edit is not a decision", async () => {
    // The job is still `awaiting_review` and still unpublishable. Stamping the
    // decision timestamp made the queue read "Edited by a reviewer, then approved
    // · 2 minutes ago" on a job nobody had approved.
    const jobId = seedLessonJob();

    await recordEditDecision(jobId, REVIEWER);

    expect(store.jobs[0].decision).toBe("edit_then_approve");
    expect(store.jobs[0].reviewedAt).toBeNull();
  });

  it("does not publish anything on its own", async () => {
    // The decision alone is not a gate opener: `assertAiPublishable` also
    // requires the job to *be* approved, which only `approveJob` writes.
    const jobId = seedLessonJob();

    await recordEditDecision(jobId, REVIEWER);

    expect(store.lessons[0].status).toBe("draft");
    expect(store.jobs[0].status).toBe("awaiting_review");
  });

  it("is a no-op on a job somebody has already decided", async () => {
    // The `jobId` is a breadcrumb the queue put in a URL; the save it rides on is
    // real work. Losing the save to a colleague's concurrent decision would be
    // the wrong trade, and the leniency weakens nothing.
    const jobId = seedLessonJob({ jobStatus: "rejected", decision: "reject" });

    await recordEditDecision(jobId, REVIEWER);

    expect(store.jobs[0].decision).toBe("reject");
  });
});

describe("listJobs", () => {
  it("lifts the grade and the languages out of the job's input", async () => {
    seedLessonJob();

    const result = await listJobs({
      status: "awaiting_review",
      take: 25,
      skip: 0,
    });

    expect(result.total).toBe(1);
    expect(result.jobs[0]).toMatchObject({
      gradeLevels: ["KG1"],
      languages: ["en", "bn"],
      entityLabel: "The letter A",
    });
  });

  it("labels a narration job with the words its clip reads", async () => {
    // A media job creates no content row, so there is no title to borrow — and a
    // queue of five unlabelled "audio" rows is a queue nobody can triage.
    seedNarrationJob();

    const result = await listJobs({
      status: "awaiting_review",
      take: 25,
      skip: 0,
    });

    expect(result.jobs[0]).toMatchObject({
      entityLabel: "চলো A শিখি",
      languages: ["bn"],
    });
  });
});

describe("getJob", () => {
  it("returns the audit record, the linked rows and an empty blocker list", async () => {
    const jobId = seedLessonJob();

    const job = await getJob(jobId);

    expect(job.rawOutput).toEqual({ attempts: [{ attempt: 1 }] });
    expect(job.entities.map((one) => one.resource)).toEqual([
      "lessons",
      "quizzes",
    ]);
    expect(job.blockers).toEqual([]);
  });

  it("reports the unattached asset and where approving will put it", async () => {
    const jobId = seedNarrationJob();

    const job = await getJob(jobId);

    expect(job.assets).toHaveLength(1);
    expect(job.assets[0]).toMatchObject({
      targetTable: "LessonTranslation",
      targetId: "lesson-9",
      isAttached: false,
      sourceText: "চলো A শিখি",
    });
  });

  it("reports the same blockers the approval would refuse on", async () => {
    // One function, two consumers: the button this list disables and the `409`
    // the endpoint returns cannot disagree about why.
    const jobId = seedLessonJob({
      questionDefinition: {
        type: "mcq",
        promptAudio: { en: `${PLACEHOLDER_ASSET_HOST}/clip.mp3` },
      },
    });

    const job = await getJob(jobId);

    expect(job.blockers).toHaveLength(1);
    await expect(approveJob(jobId, REVIEWER)).rejects.toThrow(ApiError);
  });

  it("404s an unknown job", async () => {
    await expect(getJob("nope")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("countAwaitingReview", () => {
  it("counts only the jobs waiting for a human", async () => {
    seedLessonJob();
    seedNarrationJob();
    store.jobs.push({
      id: "job-done",
      type: "lesson",
      status: "approved",
      decision: "approve",
      input: {},
      rawOutput: {},
      reviewerId: REVIEWER,
      reviewNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedAt: new Date(),
    });

    expect(await countAwaitingReview()).toEqual({ awaitingReview: 2 });
  });
});
