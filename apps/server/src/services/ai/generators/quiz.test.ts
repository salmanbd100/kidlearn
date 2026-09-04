/**
 * The AI Quiz Generator (file 35, FR-AI-03, FR-AI-07).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* Arrays per table, and the writes land in them.
 *     The `sortOrder` assertions read back what the generator wrote against what
 *     was already there, which is the whole point of the append.
 *  2. *Assert the query, not just the result.* Two claims are asserted as queries
 *     rather than results: that no `create` names a `status` (the draft default is
 *     what keeps a generated question out of a child's quiz), and that a published
 *     quiz is refused before any job row exists.
 *  3. *`where` clauses are not the whole guard.* Not applicable: this file writes.
 *     That a draft quiz's questions never reach a child is asserted in
 *     `routes/content.test.ts`.
 *  4. *Name what the stub cannot prove.* `@@unique([quizId, sortOrder])` is a
 *     database constraint; what is asserted here is the append the generator does
 *     in front of it. And that a failed `persist` leaves nothing behind is
 *     Postgres's transaction guarantee — the stub runs the callback and rethrows.
 *
 * The Gemini client is mocked, which `general.md §5` permits explicitly:
 * external network boundaries are the one allowed mock.
 */

import {
  parseQuizQuestion,
  validDragAnswer,
  validMatchPair,
  validMcq,
  validPictureSelect,
} from "@kidlearn/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id: string };

const store = vi.hoisted(() => ({
  lessons: [] as Row[],
  quizzes: [] as Row[],
  questions: [] as Row[],
  jobs: [] as Row[],
  creates: [] as Array<{ table: string; data: Record<string, unknown> }>,
}));

const ai = vi.hoisted(() => ({ generateStructured: vi.fn() }));

vi.mock("../gemini-text.js", () => ({
  generateStructured: ai.generateStructured,
}));

vi.mock("../../../lib/prisma.js", () => {
  let counter = 0;
  function nextId(prefix: string): string {
    counter += 1;
    return `${prefix}-${counter}`;
  }

  const client = {
    lesson: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = store.lessons.find((one) => one.id === where.id);
        if (!row) return null;
        const quizId = row.quizId as string | null;
        const quiz =
          quizId === null
            ? null
            : (store.quizzes.find((one) => one.id === quizId) ?? null);
        return {
          ...row,
          quiz: quiz === null ? null : { id: quiz.id, status: quiz.status },
        };
      },
    },
    quiz: {
      // Read live off the store rather than from a snapshot, which is what lets a
      // test publish the quiz mid-generation and have the write see it.
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.quizzes.find((one) => one.id === where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.creates.push({ table: "quiz", data });
        // `lessons: { connect: ... }` is the pointer the real client writes onto
        // `Lesson.quizId`; the stub does the same so the link is observable.
        const { lessons, ...columns } = data;
        const row: Row = { id: nextId("quiz"), status: "draft", ...columns };
        store.quizzes.push(row);

        const connect = (lessons as { connect?: { id: string } } | undefined)
          ?.connect;
        if (connect) {
          const lesson = store.lessons.find((one) => one.id === connect.id);
          if (lesson) lesson.quizId = row.id;
        }
        return row;
      },
    },
    quizQuestion: {
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: { quizId: string };
        orderBy?: { sortOrder?: "asc" | "desc" };
      }) => {
        const found = store.questions.filter(
          (one) => one.quizId === where.quizId,
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
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.creates.push({ table: "quizQuestion", data });
        const row: Row = { id: nextId("question"), ...data };
        store.questions.push(row);
        return row;
      },
    },
    aIGenerationJob: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.jobs.find((one) => one.id === where.id) ?? null,
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

const { generateQuiz } = await import("./quiz.js");
const { PLACEHOLDER_ASSET_HOST } = await import("../placeholder-assets.js");

const LESSON_ID = "11111111-1111-4111-8111-111111111111";
const LESSON_JOB_ID = "job-lesson-1";
const USAGE = { inputTokens: 800, outputTokens: 1600 };

/** Four questions across four formats — the shape the prompt asks for. */
function validOutput(
  questions = [validMcq, validMatchPair, validDragAnswer, validPictureSelect],
) {
  return { questions };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    lessonId: LESSON_ID,
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
  store.lessons = [
    {
      id: LESSON_ID,
      title: "The letter A",
      gradeLevels: ["KG1"],
      aiJobId: null,
      quizId: null,
      translations: [
        {
          language: "en",
          title: "The letter A",
          introScript: "Today we meet the letter A.",
        },
        {
          language: "bn",
          title: "A বর্ণ",
          introScript: "আজ আমরা A বর্ণ শিখব।",
        },
      ],
    },
  ];
  store.quizzes = [];
  store.questions = [];
  store.jobs = [];
  store.creates = [];
  ai.generateStructured.mockReset();
  ai.generateStructured.mockResolvedValue({ raw: validOutput(), usage: USAGE });
});

describe("what a successful generation writes", () => {
  it("creates the questions and reports the job", async () => {
    const result = await generateQuiz(request());

    expect(result.status).toBe("awaiting_review");
    expect(store.questions).toHaveLength(4);
    expect(store.jobs[0].status).toBe("awaiting_review");
  });

  it("never writes a status — every row takes the draft default (FR-AI-07)", async () => {
    await generateQuiz(request());

    const written = store.creates.filter(({ table }) =>
      ["quiz", "quizQuestion"].includes(table),
    );
    expect(written).not.toHaveLength(0);
    for (const { data } of written) {
      expect(data).not.toHaveProperty("status");
    }
  });

  it("stamps every row with the creating job", async () => {
    const { jobId } = await generateQuiz(request());

    for (const table of ["quiz", "quizQuestion"]) {
      for (const data of creates(table)) {
        expect(data.aiJobId).toBe(jobId);
      }
    }
  });

  it("stores questions the shared payload parser accepts", async () => {
    // The acceptance criterion: a generated question read back out of the column
    // parses with `parseQuizQuestion` — same union the renderer draws from.
    await generateQuiz(request());

    for (const row of store.questions) {
      expect(() => parseQuizQuestion(row.definition)).not.toThrow();
    }
  });

  it("records the format and schema version alongside the payload", async () => {
    await generateQuiz(request());

    expect(creates("quizQuestion").map((one) => one.format)).toEqual([
      "mcq",
      "match_pair",
      "drag_answer",
      "picture_select",
    ]);
    for (const data of creates("quizQuestion")) {
      expect(data.schemaVersion).toBe(1);
    }
  });

  it("honours the count the admin asked for", async () => {
    ai.generateStructured.mockResolvedValue({
      raw: validOutput([validMcq, validMatchPair, validDragAnswer]),
      usage: USAGE,
    });

    await generateQuiz(request({ count: 3 }));

    expect(store.questions).toHaveLength(3);
  });
});

describe("the quiz the questions are attached to", () => {
  it("creates a draft quiz and wires it to the lesson when there is none", async () => {
    await generateQuiz(request());

    expect(store.quizzes).toHaveLength(1);
    expect(store.lessons[0].quizId).toBe(store.quizzes[0].id);
    expect(creates("quizQuestion").map((one) => one.sortOrder)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("uses the lesson's existing draft quiz rather than creating a second", async () => {
    store.quizzes = [{ id: "quiz-existing", status: "draft" }];
    store.lessons[0].quizId = "quiz-existing";

    await generateQuiz(request());

    expect(creates("quiz")).toHaveLength(0);
    for (const data of creates("quizQuestion")) {
      expect(data.quizId).toBe("quiz-existing");
    }
  });

  it("appends after the questions already in the quiz", async () => {
    // `@@unique([quizId, sortOrder])` would refuse a collision, and an admin who
    // wrote two questions by hand keeps them in front of the generated ones.
    store.quizzes = [{ id: "quiz-existing", status: "draft" }];
    store.lessons[0].quizId = "quiz-existing";
    store.questions = [
      { id: "hand-1", quizId: "quiz-existing", sortOrder: 1 },
      { id: "hand-2", quizId: "quiz-existing", sortOrder: 2 },
    ];

    await generateQuiz(request());

    expect(creates("quizQuestion").map((one) => one.sortOrder)).toEqual([
      3, 4, 5, 6,
    ]);
  });
});

describe("the published-quiz refusal (FR-AI-07)", () => {
  it("refuses with 409 QUIZ_PUBLISHED and creates no job row", async () => {
    // A `QuizQuestion` has no status of its own, so a generated question appended
    // to a published quiz would be live the instant it landed — there is no draft
    // state to hold it and no transition for a reviewer to refuse.
    store.quizzes = [{ id: "quiz-live", status: "published" }];
    store.lessons[0].quizId = "quiz-live";

    await expect(generateQuiz(request())).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT",
      details: { code: "QUIZ_PUBLISHED" },
    });

    expect(store.jobs).toHaveLength(0);
    expect(store.questions).toHaveLength(0);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it("refuses the write too, when the quiz is published mid-generation", async () => {
    // The pre-flight check is a snapshot taken tens of seconds before the insert,
    // because generation is awaited inline. Publishing inside that window is the
    // one way an appended question reaches a child without review, so the status
    // is read again under the write transaction.
    store.quizzes = [{ id: "quiz-draft", status: "draft" }];
    store.lessons[0].quizId = "quiz-draft";
    ai.generateStructured.mockImplementation(async () => {
      store.quizzes[0].status = "published";
      return { raw: validOutput(), usage: USAGE };
    });

    await expect(generateQuiz(request())).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT",
      details: { code: "QUIZ_PUBLISHED" },
    });

    expect(store.questions).toHaveLength(0);
  });

  it("keeps the failed job, and names it, when it refuses the write", async () => {
    // Unlike the pre-flight refusal there *is* a job here — the model was paid
    // for — so it is failed rather than hidden, and the 409 carries its id
    // (FR-AI-08).
    store.quizzes = [{ id: "quiz-draft", status: "draft" }];
    store.lessons[0].quizId = "quiz-draft";
    ai.generateStructured.mockImplementation(async () => {
      store.quizzes[0].status = "published";
      return { raw: validOutput(), usage: USAGE };
    });

    const error = await generateQuiz(request()).catch((one: unknown) => one);

    expect(store.jobs).toHaveLength(1);
    expect(store.jobs[0].status).toBe("failed");
    expect(error).toMatchObject({ details: { jobId: store.jobs[0].id } });
  });

  it("allows a quiz that is in review or approved but not yet live", async () => {
    // Only `published` is visible to a child; the earlier states are exactly the
    // window in which an admin is still assembling the quiz.
    store.quizzes = [{ id: "quiz-review", status: "in_review" }];
    store.lessons[0].quizId = "quiz-review";

    const result = await generateQuiz(request());

    expect(result.status).toBe("awaiting_review");
    expect(store.questions).toHaveLength(4);
  });
});

describe("what the prompt is grounded in", () => {
  it("reads the objectives and narration back out of the lesson's own job", async () => {
    store.lessons[0].aiJobId = LESSON_JOB_ID;
    store.jobs.push({
      id: LESSON_JOB_ID,
      rawOutput: {
        parsed: {
          learningObjectives: ["Recognise the letter A", "Say the /a/ sound"],
          narrationScript: {
            en: "A is for apple, and for ant.",
            bn: "A মানে আপেল।",
          },
        },
      },
    });

    await generateQuiz(request());

    const input = store.jobs[store.jobs.length - 1].input as Record<
      string,
      string
    >;
    expect(input.userPrompt).toContain("Recognise the letter A");
    expect(input.userPrompt).toContain("A is for apple, and for ant.");
    expect(input.userPrompt).toContain("A মানে আপেল।");
  });

  it("falls back to the intro scripts and says so, for a hand-authored lesson", async () => {
    // An intro is a greeting rather than a lesson, so naming the gap in the prompt
    // is what stops the model inventing material a child was never shown.
    await generateQuiz(request());

    const input = store.jobs[0].input as Record<string, string>;
    expect(input.userPrompt).toContain("Today we meet the letter A.");
    expect(input.userPrompt).toContain("do not invent material");
  });

  it("falls back when the linked job's audit record holds nothing usable", async () => {
    store.lessons[0].aiJobId = LESSON_JOB_ID;
    store.jobs.push({ id: LESSON_JOB_ID, rawOutput: { error: "it failed" } });

    await generateQuiz(request());

    const input = store.jobs[store.jobs.length - 1].input as Record<
      string,
      string
    >;
    expect(input.userPrompt).toContain("Today we meet the letter A.");
  });

  it("embeds the question schema and the grade the lesson is written for", async () => {
    await generateQuiz(request());

    const input = store.jobs[0].input as Record<string, string>;
    expect(input.userPrompt).toContain("KG-1 (ages 4–5)");
    expect(input.userPrompt).toContain('"picture_select"');
    expect(input.systemPrompt).toContain("aged 3 to 6");
  });
});

describe("asset URLs", () => {
  it("rewrites every generated URL onto the reserved placeholder host", async () => {
    // A plausible-looking CDN address would survive a review that read the words
    // rather than the links, and a text model can neither draw nor record.
    ai.generateStructured.mockResolvedValue({
      raw: validOutput([
        {
          ...validMcq,
          promptAudio: {
            ...validMcq.promptAudio,
            en: {
              ...validMcq.promptAudio.en,
              url: "https://cdn.evil.example/audio/en/q1.mp3",
            },
          },
        },
        validMatchPair,
        validDragAnswer,
        validPictureSelect,
      ]),
      usage: USAGE,
    });

    await generateQuiz(request());

    const serialised = JSON.stringify(creates("quizQuestion"));
    expect(serialised).not.toContain("cdn.evil.example");
    // The path survives, so file 36 can still see what the clip was meant to be.
    expect(serialised).toContain(`${PLACEHOLDER_ASSET_HOST}/audio/en/q1.mp3`);
  });
});

describe("what is refused before a token is spent", () => {
  it("rejects a lesson id that names nothing", async () => {
    await expect(
      generateQuiz(
        request({ lessonId: "99999999-9999-4999-8999-999999999999" }),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(store.jobs).toHaveLength(0);
  });
});

describe("when the model gets it wrong", () => {
  it("retries once with the Zod issues when a question is malformed", async () => {
    const twoOptions = {
      ...validMcq,
      options: validMcq.options.slice(0, 2),
    };

    ai.generateStructured
      .mockResolvedValueOnce({
        raw: validOutput([
          twoOptions,
          validMatchPair,
          validDragAnswer,
          validPictureSelect,
        ]),
        usage: USAGE,
      })
      .mockResolvedValueOnce({ raw: validOutput(), usage: USAGE });

    const result = await generateQuiz(request());

    expect(result.status).toBe("awaiting_review");
    expect(ai.generateStructured).toHaveBeenCalledTimes(2);

    const retry = ai.generateStructured.mock.calls[1][0] as {
      messages: Array<{ content: string }>;
    };
    expect(retry.messages).toHaveLength(2);
    expect(retry.messages[1].content).toContain("failed schema validation");
    expect(retry.messages[1].content).toContain("questions");
    expect(store.questions).toHaveLength(4);
  });

  it("retries once when the set leans on a single format", async () => {
    ai.generateStructured
      .mockResolvedValueOnce({
        raw: validOutput([validMcq, validMcq, validMcq, validMcq]),
        usage: USAGE,
      })
      .mockResolvedValueOnce({ raw: validOutput(), usage: USAGE });

    const result = await generateQuiz(request());

    expect(result.status).toBe("awaiting_review");
    const retry = ai.generateStructured.mock.calls[1][0] as {
      messages: Array<{ content: string }>;
    };
    expect(retry.messages[1].content).toContain("at least 3");
  });

  it("fails the job and writes nothing after two invalid responses", async () => {
    ai.generateStructured.mockResolvedValue({
      raw: validOutput([validMcq, validMatchPair]),
      usage: USAGE,
    });

    const result = await generateQuiz(request());

    expect(result.status).toBe("failed");
    expect(store.questions).toHaveLength(0);
    expect(creates("quiz")).toHaveLength(0);
    expect(store.jobs[0].status).toBe("failed");
  });
});
