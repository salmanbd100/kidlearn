/**
 * Stubs `config/prisma.js` under the recorded exception in `general.md §5`:
 *  1. State, not answers: arrays per table; assertions read back the rows the generator created.
 *  2. Assert the query: "every row is a draft" is asserted as no `status` in any `create`, since the column
 *     default is what keeps those rows from a child.
 *  3. `include` gates: not applicable, this file only writes (the student API's 404 is asserted in
 *     `content.routes.test.ts`).
 *  4. Not provable: a failed `persist` leaving no rows is Postgres's guarantee (the tests assert the job fails
 *     and no lesson row was created by a completed path); `topicId_slug` uniqueness is a database constraint
 *     (the collision test asserts the suffixing in front of it).
 * The Gemini client is mocked (external boundary).
 */

import { validMcq } from "@kidlearn/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id: string };

const store = vi.hoisted(() => ({
  topics: [] as Row[],
  worlds: [] as Row[],
  lessons: [] as Row[],
  translations: [] as Row[],
  quizzes: [] as Row[],
  questions: [] as Row[],
  jobs: [] as Row[],
  creates: [] as Array<{ table: string; data: Record<string, unknown> }>,
}));

const ai = vi.hoisted(() => ({ generateStructured: vi.fn() }));

vi.mock("../gemini-text.js", () => ({
  generateStructured: ai.generateStructured,
}));

vi.mock("../../../../config/prisma.js", () => {
  let counter = 0;
  function nextId(prefix: string): string {
    counter += 1;
    return `${prefix}-${counter}`;
  }

  function create(
    table: string,
    rows: Row[],
    prefix: string,
    data: Record<string, unknown>,
  ): Row {
    store.creates.push({ table, data });
    const { translations, ...columns } = data;
    const row: Row = { id: nextId(prefix), ...columns };
    rows.push(row);

    if (translations && typeof translations === "object") {
      const nested = translations as {
        create?: Array<Record<string, unknown>>;
      };
      for (const one of nested.create ?? []) {
        store.creates.push({ table: `${table}.translation`, data: one });
        store.translations.push({
          id: nextId("translation"),
          lessonId: row.id,
          ...one,
        });
      }
    }
    return row;
  }

  const client = {
    topic: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = store.topics.find((one) => one.id === where.id);
        if (!row) return null;
        const subject = { name: row.subjectName };
        return { ...row, subject };
      },
    },
    world: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.worlds.find((one) => one.id === where.id) ?? null,
    },
    lesson: {
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: { topicId: string };
        orderBy?: { sortOrder?: "asc" | "desc" };
      }) => {
        const found = store.lessons.filter(
          (one) => one.topicId === where.topicId,
        );
        const direction = orderBy?.sortOrder === "desc" ? -1 : 1;
        return (
          [...found].sort(
            (left, right) =>
              direction *
              (Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0)),
          )[0] ?? null
        );
      },
      findUnique: async ({
        where,
      }: {
        where: { topicId_slug: { topicId: string; slug: string } };
      }) =>
        store.lessons.find(
          (one) =>
            one.topicId === where.topicId_slug.topicId &&
            one.slug === where.topicId_slug.slug,
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) =>
        create("lesson", store.lessons, "lesson", data),
    },
    quiz: {
      create: async ({ data }: { data: Record<string, unknown> }) =>
        create("quiz", store.quizzes, "quiz", data),
    },
    quizQuestion: {
      create: async ({ data }: { data: Record<string, unknown> }) =>
        create("quizQuestion", store.questions, "question", data),
    },
    aIGenerationJob: {
      // The stale-job sweep that precedes every run; nothing here is old enough.
      updateMany: async () => ({ count: 0 }),
      // The cap check reads today's spend; these suites exercise one job at a time.
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = { id: nextId("job"), ...data };
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

const { generateLesson } = await import("./lesson.js");
const { PLACEHOLDER_ASSET_HOST } = await import("../placeholder-assets.js");
const { LESSON_QUESTION_COUNT } = await import("../schemas/lesson.js");

const TOPIC_ID = "11111111-1111-4111-8111-111111111111";
const SUBJECT_ID = "22222222-2222-4222-8222-222222222222";
const WORLD_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_WORLD_ID = "44444444-4444-4444-8444-444444444444";

const USAGE = { inputTokens: 900, outputTokens: 1500 };

// A schema-valid question from the shared payload fixture, so this suite cannot pass on a shape `QuizQuestionSchema` rejects.
function mcq(promptEn: string, audioUrl?: string) {
  return {
    ...validMcq,
    prompt: { ...validMcq.prompt, en: promptEn },
    ...(audioUrl === undefined
      ? {}
      : {
          promptAudio: {
            ...validMcq.promptAudio,
            en: { ...validMcq.promptAudio.en, url: audioUrl },
          },
        }),
  };
}

function validBody(languages: Array<"en" | "bn"> = ["en", "bn"]) {
  const script = (text: string) =>
    Object.fromEntries(languages.map((one) => [one, `${text} (${one})`]));

  return {
    title: script("The letter A"),
    learningObjectives: ["Recognise the letter A", "Say the /a/ sound"],
    introScript: script("Hello there"),
    narrationScript: script("A is for apple"),
  };
}

function validQuestions() {
  return [mcq("q1"), mcq("q2"), mcq("q3"), mcq("q4")];
}

const CALLS_PER_ATTEMPT = 1 + LESSON_QUESTION_COUNT;

function mockGeneration(
  round: (attempt: number) => { body: unknown; questions: unknown[] },
) {
  let call = 0;
  ai.generateStructured.mockImplementation(async () => {
    const { body, questions } = round(Math.floor(call / CALLS_PER_ATTEMPT));
    const index = call % CALLS_PER_ATTEMPT;
    call += 1;
    return {
      raw: index === 0 ? body : questions[index - 1],
      usage: USAGE,
      stopReason: "stop",
    };
  });
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    gradeLevel: "KG1" as const,
    subjectId: SUBJECT_ID,
    topicId: TOPIC_ID,
    lessonFocus: "The letter A",
    languages: ["en", "bn"] as Array<"en" | "bn">,
    ...overrides,
  };
}

function creates(table: string) {
  return store.creates
    .filter((one) => one.table === table)
    .map((one) => one.data);
}

beforeEach(() => {
  store.topics = [
    {
      id: TOPIC_ID,
      name: "Letters",
      subjectId: SUBJECT_ID,
      subjectName: "English",
    },
  ];
  store.worlds = [{ id: WORLD_ID }, { id: OTHER_WORLD_ID }];
  store.lessons = [
    {
      id: "seed-lesson",
      topicId: TOPIC_ID,
      worldId: WORLD_ID,
      sortOrder: 1,
      slug: "seed",
    },
  ];
  store.translations = [];
  store.quizzes = [];
  store.questions = [];
  store.jobs = [];
  store.creates = [];
  ai.generateStructured.mockReset();
  mockGeneration(() => ({ body: validBody(), questions: validQuestions() }));
});

describe("what a successful generation writes", () => {
  it("creates a lesson, a quiz and its questions, and reports the job", async () => {
    const result = await generateLesson(request());

    expect(result.status).toBe("awaiting_review");
    expect(store.lessons).toHaveLength(2);
    expect(store.quizzes).toHaveLength(1);
    expect(store.questions).toHaveLength(LESSON_QUESTION_COUNT);
    expect(store.jobs[0].status).toBe("awaiting_review");
  });

  it("never writes a status — every row takes the draft default (FR-AI-07)", async () => {
    await generateLesson(request());

    const written = store.creates.filter(({ table }) =>
      ["lesson", "quiz", "quizQuestion"].includes(table),
    );
    expect(written).not.toHaveLength(0);
    for (const { data } of written) {
      expect(data).not.toHaveProperty("status");
    }
  });

  it("stamps every content row with the creating job", async () => {
    const { jobId } = await generateLesson(request());

    for (const table of ["lesson", "quiz", "quizQuestion"]) {
      for (const data of creates(table)) {
        expect(data.aiJobId).toBe(jobId);
      }
    }
  });

  it("points the lesson at the quiz it just created", async () => {
    await generateLesson(request());

    const [lesson] = creates("lesson");
    expect(lesson.quizId).toBe(store.quizzes[0].id);
  });

  it("numbers the questions from one, in the order the model returned them", async () => {
    await generateLesson(request());

    expect(creates("quizQuestion").map((one) => one.sortOrder)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("gives each locale the title the model wrote for it, not the focus line", async () => {
    // `LessonTranslation.title` is what a child reads: an English focus line in the Bangla row would be untranslated child-facing text (FR-I18N-01).
    await generateLesson(request());

    const written = creates("lesson.translation");
    const byLanguage = Object.fromEntries(
      written.map((one) => [one.language, one.title]),
    );
    expect(byLanguage.en).toBe("The letter A (en)");
    expect(byLanguage.bn).toBe("The letter A (bn)");

    // The row the CMS lists and the slug still come from what the admin typed.
    const [lesson] = creates("lesson");
    expect(lesson.title).toBe("The letter A");
    expect(lesson.slug).toBe("the-letter-a");
  });

  it("writes one translation per requested locale and no more", async () => {
    mockGeneration(() => ({
      body: validBody(["en"]),
      questions: validQuestions(),
    }));

    await generateLesson(request({ languages: ["en"] }));

    const written = creates("lesson.translation");
    expect(written).toHaveLength(1);
    expect(written[0].language).toBe("en");
    expect(written[0].introScript).toContain("(en)");
  });

  it("keeps the narration script in the job rather than in a column", async () => {
    await generateLesson(request());

    // Narration reads it from here; no lesson column holds it because that column will be an audio asset reference.
    const rawOutput = store.jobs[0].rawOutput as {
      parsed: { narrationScript: Record<string, string> };
    };
    expect(rawOutput.parsed.narrationScript.bn).toContain("(bn)");
    for (const data of creates("lesson")) {
      expect(data).not.toHaveProperty("narrationScript");
    }
  });

  it("records the prompts the model actually saw", async () => {
    await generateLesson(request());

    const input = store.jobs[0].input as Record<string, string>;
    expect(input.userPrompt).toContain("The letter A");
    expect(input.userPrompt).toContain("Letters");
    expect(input.userPrompt).toContain("English");
    expect(input.systemPrompt).toContain("aged 3 to 6");

    // Questions are asked for one at a time, so question three's prompt is not the lesson prompt (FR-AI-08).
    const questionPrompts = (store.jobs[0].input as Record<string, string[]>)
      .questionPrompts;
    expect(questionPrompts).toHaveLength(LESSON_QUESTION_COUNT);
    expect(questionPrompts[1]).toContain("question 2 of 4");
    expect(questionPrompts[1]).toContain("match_pair");
  });
});

describe("asset URLs", () => {
  it("rewrites every generated URL onto the reserved placeholder host", async () => {
    mockGeneration(() => ({
      body: validBody(),
      questions: [
        mcq("q1", "https://cdn.evil.example/audio/en/q1.mp3"),
        mcq("q2"),
        mcq("q3"),
        mcq("q4"),
      ],
    }));

    await generateLesson(request());

    const serialised = JSON.stringify(creates("quizQuestion"));
    expect(serialised).not.toContain("cdn.evil.example");
    // The path survives so each clip's intent is still visible.
    expect(serialised).toContain(`${PLACEHOLDER_ASSET_HOST}/audio/en/q1.mp3`);
  });
});

describe("slugs", () => {
  it("derives the slug from the lesson focus", async () => {
    await generateLesson(request({ lessonFocus: "The letter A" }));

    expect(creates("lesson")[0].slug).toBe("the-letter-a");
  });

  it("suffixes rather than colliding with an existing lesson in the topic", async () => {
    store.lessons.push({
      id: "existing",
      topicId: TOPIC_ID,
      slug: "the-letter-a",
      sortOrder: 2,
    });

    await generateLesson(request({ lessonFocus: "The letter A" }));

    expect(creates("lesson")[0].slug).toBe("the-letter-a-2");
  });
});

describe("the world", () => {
  it("inherits the world from the topic's existing lessons", async () => {
    await generateLesson(request());

    expect(creates("lesson")[0].worldId).toBe(WORLD_ID);
  });

  it("uses the world the admin chose when one is given", async () => {
    await generateLesson(request({ worldId: OTHER_WORLD_ID }));

    expect(creates("lesson")[0].worldId).toBe(OTHER_WORLD_ID);
  });

  it("refuses rather than guessing when a topic has no lessons to inherit from", async () => {
    store.lessons = [];

    await expect(generateLesson(request())).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(store.jobs).toHaveLength(0);
  });
});

describe("what is refused before a token is spent", () => {
  it("rejects an unknown topic", async () => {
    await expect(
      generateLesson(
        request({ topicId: "55555555-5555-4555-8555-555555555555" }),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it("rejects a topic that belongs to a different subject", async () => {
    await expect(
      generateLesson(
        request({ subjectId: "66666666-6666-4666-8666-666666666666" }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it("rejects a world id that names nothing", async () => {
    await expect(
      generateLesson(
        request({ worldId: "77777777-7777-4777-8777-777777777777" }),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });
});

describe("when the model gets it wrong", () => {
  it("retries once when a requested locale is missing, then succeeds", async () => {
    mockGeneration((attempt) => ({
      // English only on the first attempt, when both were asked for.
      body: attempt === 0 ? validBody(["en"]) : validBody(),
      questions: validQuestions(),
    }));

    const result = await generateLesson(request());

    expect(result.status).toBe("awaiting_review");
    expect(ai.generateStructured).toHaveBeenCalledTimes(CALLS_PER_ATTEMPT * 2);

    // The first call of the second attempt — the body, asked for again.
    const retry = ai.generateStructured.mock.calls[CALLS_PER_ATTEMPT][0] as {
      messages: Array<{ content: string }>;
    };
    expect(retry.messages).toHaveLength(2);
    expect(retry.messages[1].content).toContain("failed schema validation");
    expect(retry.messages[1].content).toContain("introScript.bn");
  });

  it("fails the job and writes nothing after two invalid responses", async () => {
    // Two questions where the schema's floor is three.
    mockGeneration(() => ({
      body: validBody(),
      questions: [mcq("q1"), mcq("q2")],
    }));

    const result = await generateLesson(request());

    expect(result.status).toBe("failed");
    expect(store.quizzes).toHaveLength(0);
    expect(store.questions).toHaveLength(0);
    expect(creates("lesson")).toHaveLength(0);
    expect(store.jobs[0].status).toBe("failed");
  });
});
