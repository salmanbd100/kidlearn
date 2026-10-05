/**
 * Stubs `config/prisma.js` under the recorded exception in `general.md §5`; the four bounds:
 *  1. Stub state: one array per table, every write lands in it, assertions read the rows back.
 *  2. Status claims are read off the stored rows; "rejected leaves nothing published" is asserted over the whole store.
 *  3. Student-facing filtering is asserted in `content.routes.test.ts` and `stories.routes.test.ts`; here only that the row lands on `rejected`.
 *  4. Atomicity is Postgres's: the stub runs the `$transaction` callback directly, so a mid-chain failure is asserted
 *     as "job not decided", and Serializable isolation against the options passed to `$transaction`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../../shared/errors/errors.js";
import { PLACEHOLDER_ASSET_HOST } from "../placeholder-assets.js";

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
  transactions: [] as unknown[],
}));

vi.mock("../../../../config/prisma.js", () => {
  // Only `{ id: { in } }` and `{ aiJobId: { not: null } }` are non-equality filters.
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

  /** Translation tables use a compound unique key the generic `matches` cannot express. */
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
      // The generic table cannot resolve the parent-quiz relation; the projection is built from `select`
      // because callers ask for different shapes (and `readQuizAiJobIds` for `distinct`).
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

const { countAwaitingReview, getJob, listJobs } = await import("./queue.js");
const { approveJob, recordEditDecision, rejectJob } = await import(
  "./decide.js"
);

const REVIEWER = "admin-1";

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
    // `Lesson` is the only linked table with `updatedBy`; the others use the job's `reviewerId`.
    const jobId = seedLessonJob();

    await approveJob(jobId, REVIEWER);

    expect(store.lessons[0].updatedBy).toBe(REVIEWER);
  });

  it("preserves an edit_then_approve decision rather than overwriting it", async () => {
    // Only record that the live words differ from the model's; overwriting it to "approve" loses that (FR-AI-08).
    const jobId = seedLessonJob({ decision: "edit_then_approve" });

    await approveJob(jobId, REVIEWER);

    expect(store.jobs[0].decision).toBe("edit_then_approve");
    expect(store.jobs[0].status).toBe("approved");
    expect(store.lessons[0].status).toBe("published");
  });

  it("publishes the parent quiz of generated questions even when the quiz predates the job", async () => {
    // Quiz questions have no status, so approving them means publishing their quiz, or they go live invisibly.
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
    // `finish` rebuilds the detail after the decision, so a blocker computed from "not awaiting review"
    // would show "cannot be approved yet" beneath the success notice.
    const jobId = seedLessonJob();

    const result = await approveJob(jobId, REVIEWER);

    expect(result.job.status).toBe("approved");
    expect(result.job.blockers).toEqual([]);
  });

  it("runs at Serializable isolation", async () => {
    // The stub cannot race two admins; assert the isolation level requested instead.
    await approveJob(seedLessonJob(), REVIEWER);

    expect(store.transactions[0]).toMatchObject({
      isolationLevel: "Serializable",
    });
  });

  it("attaches an audio job's asset to the foreign key the generation recorded", async () => {
    // For a media job "publish" means writing the key; the clip is reachable only via its published parent (FR-CMS-05).
    const jobId = seedNarrationJob();

    const result = await approveJob(jobId, REVIEWER);

    expect(store.lessonTranslations[0].introAudioAssetId).toBe("asset-1");
    expect(result.attachedAssetIds).toEqual(["asset-1"]);
  });

  it("creates the quiz question translation row when the clip's target has none", async () => {
    // A `QuizQuestionTranslation` exists only once a question gains audio, hence upsert.
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
    // No `draft → rejected` edge, so the chain goes through review.
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
    // Nothing points at a rejected clip, which keeps it out of lessons a child plays.
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
    // No `published → in_review` edge: a fixed two-hop chain threw `INVALID_TRANSITION` and rolled back,
    // so a job whose content was live could not be rejected.
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
    // Still `awaiting_review` and unpublishable; stamping the decision time showed "approved" for an unapproved job.
    const jobId = seedLessonJob();

    await recordEditDecision(jobId, REVIEWER);

    expect(store.jobs[0].decision).toBe("edit_then_approve");
    expect(store.jobs[0].reviewedAt).toBeNull();
  });

  it("does not publish anything on its own", async () => {
    // `assertAiPublishable` also requires the job to be approved, which only `approveJob` writes.
    const jobId = seedLessonJob();

    await recordEditDecision(jobId, REVIEWER);

    expect(store.lessons[0].status).toBe("draft");
    expect(store.jobs[0].status).toBe("awaiting_review");
  });

  it("is a no-op on a job somebody has already decided", async () => {
    // `jobId` is only a breadcrumb; losing the save to a concurrent decision would be the wrong trade.
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
    // A media job has no content row to borrow a title from.
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
    // The disabled button and the `409` must agree about why.
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
