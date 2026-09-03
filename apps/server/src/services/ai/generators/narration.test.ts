/**
 * Batch narration (file 36, FR-AI-04, FR-I18N-05, FR-CMS-05, FR-AI-07).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* Arrays per table, and the writes land in them.
 *     Every assertion reads back rows the generator created rather than a value
 *     queued in advance, which is what makes "the translation's foreign key is
 *     still null" checkable at all.
 *  2. *Assert the query, not just the result.* The central claim of this file is
 *     negative — no narration foreign key is written — so it asserts the absence
 *     of any `lessonTranslation`/`storyPageTranslation`/`quizQuestionTranslation`
 *     update alongside the presence of the asset rows. A return-value assertion
 *     would prove nothing about it.
 *  3. *`where` clauses are not the whole guard.* Not applicable: nothing here
 *     reads student-facing content. That a clip cannot reach a child is a
 *     property of the null foreign key, asserted directly.
 *  4. *Name what the stub cannot prove.* Two things. That
 *     `@@unique([lessonId, language])` and its two siblings are real constraints
 *     is the database's business; the tests here assert the `(targetId, locale)`
 *     pair the generator records against them. And that a failed `persist` leaves
 *     no asset row is Postgres's transaction guarantee — the stub runs the
 *     callback and rethrows, so the test asserts the *job* failed.
 *
 * ElevenLabs and the Cloudinary upload are mocked, which `general.md §5` permits
 * explicitly: external network boundaries are the one allowed mock.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id: string };

const store = vi.hoisted(() => ({
  lessons: [] as Row[],
  stories: [] as Row[],
  quizzes: [] as Row[],
  mediaAssets: [] as Row[],
  jobs: [] as Row[],
  /** Every write the generator issued, so the negative claims are checkable. */
  writes: [] as Array<{
    table: string;
    op: string;
    data?: Record<string, unknown>;
  }>,
}));

const voice = vi.hoisted(() => ({ generateNarration: vi.fn() }));
const upload = vi.hoisted(() => ({ uploadBuffer: vi.fn() }));

vi.mock("../elevenlabs.js", () => ({
  generateNarration: voice.generateNarration,
}));

vi.mock("../../mediaService.js", async (importOriginal) => ({
  // `registerAsset` stays real: the `kind`, `language` and `aiJobId` this suite
  // asserts on are written by it, so replacing it would test the test.
  ...(await importOriginal<typeof import("../../mediaService.js")>()),
  uploadBuffer: upload.uploadBuffer,
}));

vi.mock("../../../lib/prisma.js", () => {
  let counter = 0;
  const nextId = (prefix: string): string => {
    counter += 1;
    return `${prefix}-${counter}`;
  };

  const forbid = (table: string, op: string) => async () => {
    store.writes.push({ table, op });
    throw new Error(`${table}.${op} must not be called by the narration batch`);
  };

  const client = {
    lesson: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.lessons.find((one) => one.id === where.id) ?? null,
    },
    story: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.stories.find((one) => one.id === where.id) ?? null,
    },
    quiz: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.quizzes.find((one) => one.id === where.id) ?? null,
    },
    // The three tables that hold a narration foreign key. Every write method is
    // a throw, so "the attachment is deferred to file 37" is enforced by the stub
    // rather than only asserted after the fact.
    lessonTranslation: {
      update: forbid("lessonTranslation", "update"),
      updateMany: forbid("lessonTranslation", "updateMany"),
      upsert: forbid("lessonTranslation", "upsert"),
    },
    storyPageTranslation: {
      update: forbid("storyPageTranslation", "update"),
      updateMany: forbid("storyPageTranslation", "updateMany"),
      upsert: forbid("storyPageTranslation", "upsert"),
    },
    quizQuestionTranslation: {
      update: forbid("quizQuestionTranslation", "update"),
      updateMany: forbid("quizQuestionTranslation", "updateMany"),
      upsert: forbid("quizQuestionTranslation", "upsert"),
    },
    mediaAsset: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.writes.push({ table: "mediaAsset", op: "create", data });
        const row: Row = {
          id: nextId("asset"),
          createdAt: new Date(),
          ...data,
        };
        store.mediaAssets.push(row);
        return row;
      },
    },
    aIGenerationJob: {
      count: async ({
        where,
      }: {
        where: { type: { in: string[] }; createdAt: { gte: Date } };
      }) =>
        store.jobs.filter(
          (job) =>
            where.type.in.includes(String(job.type)) &&
            (job.createdAt as Date).getTime() >= where.createdAt.gte.getTime(),
        ).length,
      findMany: async ({
        where,
      }: {
        where: {
          type: string;
          status: { in: string[] };
          input: { path: string[]; equals: string };
        };
      }) =>
        store.jobs.filter((job) => {
          if (job.type !== where.type) return false;
          if (!where.status.in.includes(String(job.status))) return false;
          const input = job.input as Record<string, unknown> | undefined;
          // The stub applies the JSON path filter rather than ignoring it, so the
          // idempotency tests assert the query and not just the outcome.
          return input?.[where.input.path[0]] === where.input.equals;
        }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = { id: nextId("job"), createdAt: new Date(), ...data };
        store.jobs.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = store.jobs.find((one) => one.id === where.id);
        if (!row) throw new Error("no such job");
        Object.assign(row, data);
        return row;
      },
    },
    $transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> =>
      run(client),
  };

  return { prisma: client };
});

const { generateNarrationBatch } = await import("./narration.js");

const LESSON_ID = "lesson-a";
const STORY_ID = "story-a";
const QUIZ_ID = "quiz-a";

function lessonWith(translations: Array<Record<string, unknown>>): Row {
  return { id: LESSON_ID, translations };
}

function findJob(id: unknown): Row {
  const job = store.jobs.find((one) => one.id === id);
  if (!job) throw new Error(`no job ${String(id)}`);
  return job;
}

function jobInput(id: unknown): Record<string, unknown> {
  return findJob(id).input as Record<string, unknown>;
}

function jobEntities(id: unknown): Record<string, unknown> {
  const rawOutput = findJob(id).rawOutput as Record<string, unknown>;
  return rawOutput.entities as Record<string, unknown>;
}

beforeEach(() => {
  store.lessons = [];
  store.stories = [];
  store.quizzes = [];
  store.mediaAssets = [];
  store.jobs = [];
  store.writes = [];

  voice.generateNarration.mockReset();
  voice.generateNarration.mockResolvedValue(Buffer.from([1, 2, 3]));
  upload.uploadBuffer.mockReset();
  upload.uploadBuffer.mockImplementation(
    async () => "https://res.cloudinary.com/test-cloud/video/upload/clip.mp3",
  );
});

describe("which pairs a lesson batch generates", () => {
  it("generates only the locale that is missing audio", async () => {
    store.lessons.push(
      lessonWith([
        {
          language: "en",
          introScript: "Hello, let us learn the letter A.",
          introAudioAssetId: "existing-asset",
        },
        {
          language: "bn",
          introScript: "চলো আমরা অ শিখি।",
          introAudioAssetId: null,
        },
      ]),
    );

    const result = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });

    expect(result.jobIds).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(voice.generateNarration).toHaveBeenCalledTimes(1);
    expect(voice.generateNarration).toHaveBeenCalledWith(
      "চলো আমরা অ শিখি।",
      "bn",
    );
  });

  it("skips a locale whose intro script is empty", async () => {
    // There is nothing to read, so the pair is not generatable — but it is also
    // not "already narrated", which is why it counts as skipped rather than
    // silently vanishing from the arithmetic.
    store.lessons.push(
      lessonWith([
        { language: "en", introScript: "   ", introAudioAssetId: null },
        {
          language: "bn",
          introScript: "চলো আমরা অ শিখি।",
          introAudioAssetId: null,
        },
      ]),
    );

    const result = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });

    expect(result.jobIds).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it("404s on a lesson that does not exist", async () => {
    await expect(
      generateNarrationBatch({ entity: "lesson", id: "nope" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("what a narration job records", () => {
  beforeEach(() => {
    store.lessons.push(
      lessonWith([
        {
          language: "bn",
          introScript: "চলো আমরা অ শিখি।",
          introAudioAssetId: null,
        },
      ]),
    );
  });

  it("writes one MediaAsset carrying kind, its own language and the job id", async () => {
    const result = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });

    expect(store.mediaAssets).toHaveLength(1);
    expect(store.mediaAssets[0]).toMatchObject({
      kind: "audio",
      // FR-I18N-05: an asset with a null language is a clip nobody can tell the
      // language of, and a Bangla learner could be served the English one.
      language: "bn",
      aiJobId: result.jobIds[0],
      url: "https://res.cloudinary.com/test-cloud/video/upload/clip.mp3",
    });
  });

  it("leaves the job awaiting_review", async () => {
    const result = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });

    expect(findJob(result.jobIds[0])).toMatchObject({
      type: "audio",
      status: "awaiting_review",
    });
  });

  it("keeps the words that were spoken and what they cost", async () => {
    // A reviewer months later needs the text the voice actually read; the row it
    // came from may have been edited since (FR-AI-08). ElevenLabs meters
    // characters, so `charCount` is what this job cost.
    const result = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });

    expect(jobInput(result.jobIds[0])).toMatchObject({
      entity: "lesson",
      entityId: LESSON_ID,
      targetTable: "LessonTranslation",
      targetId: LESSON_ID,
      locale: "bn",
      text: "চলো আমরা অ শিখি।",
      charCount: "চলো আমরা অ শিখি।".length,
    });
  });

  it("names the asset and the target it was recorded for in rawOutput", async () => {
    const result = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });

    expect(jobEntities(result.jobIds[0])).toMatchObject({
      assetId: store.mediaAssets[0].id,
      targetTable: "LessonTranslation",
      targetId: LESSON_ID,
      locale: "bn",
    });
  });

  it("fails the job rather than throwing when the voice provider errors", async () => {
    voice.generateNarration.mockRejectedValue(new Error("ElevenLabs 429"));

    const result = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });

    expect(findJob(result.jobIds[0]).status).toBe("failed");
    expect(store.mediaAssets).toHaveLength(0);
  });

  it("counts the failed jobs, so a dead provider key is not reported as work done", async () => {
    // The batch answers 202 with the ids either way — the jobs exist and hold
    // their own error. Without this count the caller cannot tell sixteen clips
    // recorded from sixteen clips that produced nothing, and the CMS said the
    // former.
    voice.generateNarration.mockRejectedValue(new Error("ElevenLabs 401"));

    const result = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });

    expect(result.jobIds).toHaveLength(1);
    expect(result.failed).toBe(1);
  });

  it("reports zero failures when every clip is recorded", async () => {
    const result = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });

    expect(result.jobIds.length).toBeGreaterThan(0);
    expect(result.failed).toBe(0);
  });

  it("counts only the clips that failed when a batch is part-successful", async () => {
    store.lessons.length = 0;
    store.lessons.push(
      lessonWith([
        {
          language: "en",
          introScript: "Hello there.",
          introAudioAssetId: null,
        },
        { language: "bn", introScript: "নমস্কার।", introAudioAssetId: null },
      ]),
    );
    voice.generateNarration
      .mockResolvedValueOnce(Buffer.from("mp3"))
      .mockRejectedValueOnce(new Error("ElevenLabs 429"));

    const result = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });

    expect(result.jobIds).toHaveLength(2);
    expect(result.failed).toBe(1);
  });
});

describe("nothing is attached to a translation row (FR-CMS-05, FR-AI-07)", () => {
  it("writes no narration foreign key on a lesson", async () => {
    store.lessons.push(
      lessonWith([
        {
          language: "en",
          introScript: "Hello there.",
          introAudioAssetId: null,
        },
        { language: "bn", introScript: "নমস্কার।", introAudioAssetId: null },
      ]),
    );

    await generateNarrationBatch({ entity: "lesson", id: LESSON_ID });

    // The asset rows exist; the keys that would make them audible do not. That is
    // the whole of the deferral — an admin listens first, and file 37 attaches on
    // approval.
    expect(store.mediaAssets).toHaveLength(2);
    expect(
      store.writes.filter((write) => write.table !== "mediaAsset"),
    ).toEqual([]);
  });

  it("writes no narration foreign key on a story", async () => {
    store.stories.push({
      id: STORY_ID,
      pages: [
        {
          id: "page-1",
          translations: [
            {
              language: "en",
              text: "Nibbles woke up.",
              narrationAudioAssetId: null,
            },
          ],
        },
      ],
    });

    await generateNarrationBatch({ entity: "story", id: STORY_ID });

    expect(store.mediaAssets).toHaveLength(1);
    expect(
      store.writes.filter((write) => write.table !== "mediaAsset"),
    ).toEqual([]);
  });
});

describe("a story batch", () => {
  beforeEach(() => {
    store.stories.push({
      id: STORY_ID,
      pages: [
        {
          id: "page-1",
          translations: [
            {
              language: "en",
              text: "Nibbles woke up.",
              narrationAudioAssetId: "asset-existing",
            },
            {
              language: "bn",
              text: "নিবলস জেগে উঠল।",
              narrationAudioAssetId: null,
            },
          ],
        },
        {
          id: "page-2",
          translations: [
            {
              language: "en",
              text: "He found a carrot.",
              narrationAudioAssetId: null,
            },
            {
              language: "bn",
              text: "সে একটি গাজর পেল।",
              narrationAudioAssetId: null,
            },
          ],
        },
      ],
    });
  });

  it("creates one job per missing page-and-locale pair", async () => {
    const result = await generateNarrationBatch({
      entity: "story",
      id: STORY_ID,
    });

    expect(result.jobIds).toHaveLength(3);
    expect(result.skipped).toBe(1);
  });

  it("records each clip against its own page id", async () => {
    // `targetId` is the page, not the story: `(storyPageId, language)` is the
    // unique key file 37 upserts the attachment on.
    const result = await generateNarrationBatch({
      entity: "story",
      id: STORY_ID,
    });

    const targets = result.jobIds.map((id) => {
      const input = jobInput(id);
      return `${input.targetId}:${input.locale}`;
    });
    expect(targets.sort()).toEqual(["page-1:bn", "page-2:bn", "page-2:en"]);
  });

  it("stamps each asset with the locale of the clip it holds", async () => {
    await generateNarrationBatch({ entity: "story", id: STORY_ID });

    expect(store.mediaAssets.map((asset) => asset.language).sort()).toEqual([
      "bn",
      "bn",
      "en",
    ]);
  });
});

describe("a quiz batch", () => {
  it("takes the words from definition.prompt, per locale", async () => {
    // `QuizQuestionTranslation` holds an audio key and nothing else, so the text
    // worth narrating lives in the JSONB payload.
    store.quizzes.push({
      id: QUIZ_ID,
      questions: [
        {
          id: "question-1",
          definition: {
            prompt: { en: "Which one is the letter A?", bn: "কোনটি অ?" },
          },
          translations: [],
        },
      ],
    });

    const result = await generateNarrationBatch({
      entity: "quiz",
      id: QUIZ_ID,
    });

    expect(result.jobIds).toHaveLength(2);
    expect(voice.generateNarration.mock.calls.map((call) => call)).toEqual([
      ["Which one is the letter A?", "en"],
      ["কোনটি অ?", "bn"],
    ]);
  });

  it("skips a locale whose question translation already has audio", async () => {
    store.quizzes.push({
      id: QUIZ_ID,
      questions: [
        {
          id: "question-1",
          definition: {
            prompt: { en: "Which one is the letter A?", bn: "কোনটি অ?" },
          },
          translations: [{ language: "en", audioAssetId: "asset-existing" }],
        },
      ],
    });

    const result = await generateNarrationBatch({
      entity: "quiz",
      id: QUIZ_ID,
    });

    expect(result.jobIds).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(jobInput(result.jobIds[0])).toMatchObject({
      targetTable: "QuizQuestionTranslation",
      targetId: "question-1",
      locale: "bn",
    });
  });

  it("ignores a locale the payload carries no prompt for", async () => {
    store.quizzes.push({
      id: QUIZ_ID,
      questions: [
        {
          id: "question-1",
          definition: { prompt: { en: "Which one is the letter A?" } },
          translations: [],
        },
      ],
    });

    const result = await generateNarrationBatch({
      entity: "quiz",
      id: QUIZ_ID,
    });

    expect(result.jobIds).toHaveLength(1);
    expect(result.skipped).toBe(0);
  });

  it("does not throw on a question whose definition is not a payload at all", async () => {
    // A malformed row is the editor's and file 37's problem; it must not stop the
    // other four questions from being narrated.
    store.quizzes.push({
      id: QUIZ_ID,
      questions: [
        { id: "question-1", definition: "nonsense", translations: [] },
        {
          id: "question-2",
          definition: { prompt: { en: "Which is A?" } },
          translations: [],
        },
      ],
    });

    const result = await generateNarrationBatch({
      entity: "quiz",
      id: QUIZ_ID,
    });

    expect(result.jobIds).toHaveLength(1);
  });
});

describe("re-running the batch", () => {
  beforeEach(() => {
    store.lessons.push(
      lessonWith([
        {
          language: "en",
          introScript: "Hello there.",
          introAudioAssetId: null,
        },
      ]),
    );
  });

  it("creates nothing while a clip for the pair is awaiting review", async () => {
    // The foreign key is still null — attachment is file 37's — so the FK check
    // alone would ask for the same clip again, bill twice, and hand the reviewer
    // two takes when they asked for one.
    const first = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });
    expect(first.jobIds).toHaveLength(1);

    const second = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });

    expect(second.jobIds).toEqual([]);
    expect(second.skipped).toBe(1);
    expect(voice.generateNarration).toHaveBeenCalledTimes(1);
  });

  it("asks again once the earlier job failed", async () => {
    voice.generateNarration.mockRejectedValueOnce(new Error("ElevenLabs 500"));
    const first = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });
    expect(findJob(first.jobIds[0]).status).toBe("failed");

    const second = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });

    expect(second.jobIds).toHaveLength(1);
  });

  it("does not treat another entity's in-flight job as this one's", async () => {
    store.stories.push({
      id: STORY_ID,
      pages: [
        {
          id: "page-1",
          translations: [
            {
              language: "en",
              text: "Nibbles woke up.",
              narrationAudioAssetId: null,
            },
          ],
        },
      ],
    });

    await generateNarrationBatch({ entity: "story", id: STORY_ID });
    const lesson = await generateNarrationBatch({
      entity: "lesson",
      id: LESSON_ID,
    });

    expect(lesson.jobIds).toHaveLength(1);
  });
});

describe("the daily audio cap", () => {
  it("refuses the whole batch rather than narrating part of it", async () => {
    const { env } = await import("../../../lib/env.js");
    for (let index = 0; index < env.AI_AUDIO_JOBS_PER_DAY - 1; index += 1) {
      store.jobs.push({
        id: `filler-${index}`,
        type: "audio",
        status: "awaiting_review",
        createdAt: new Date(),
      });
    }
    store.stories.push({
      id: STORY_ID,
      pages: [
        {
          id: "page-1",
          translations: [
            { language: "en", text: "One.", narrationAudioAssetId: null },
            { language: "bn", text: "এক।", narrationAudioAssetId: null },
          ],
        },
      ],
    });

    await expect(
      generateNarrationBatch({ entity: "story", id: STORY_ID }),
    ).rejects.toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });

    // Nothing was spent: a batch that only partly fits is a story narrated on
    // half its pages, which still has to be finished tomorrow.
    expect(voice.generateNarration).not.toHaveBeenCalled();
    expect(store.mediaAssets).toHaveLength(0);
  });
});
