/**
 * The AI Story Generator (file 35, FR-AI-02, FR-AI-07).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* Arrays per table, and the writes land in them.
 *     The assertions read back the rows the generator created rather than a value
 *     queued in advance, which is what makes "every row is a draft" and "the pages
 *     are in order" checkable at all.
 *  2. *Assert the query, not just the result.* The draft guarantee is asserted as
 *     the absence of any `status` in every `create` the generator issued — the
 *     column's default is what keeps a generated story out of the library, so an
 *     assertion on the return value would prove nothing.
 *  3. *`where` clauses are not the whole guard.* Not applicable: this file only
 *     writes. That a draft story answers `404` on the student library is asserted
 *     in `routes/stories.test.ts`, against the `status: "published"` filter every
 *     read there carries.
 *  4. *Name what the stub cannot prove.* Two things. That `@@unique([storyId,
 *     sortOrder])` and `Story.slug @unique` are real constraints is the database's
 *     business; the tests here assert the numbering and the suffixing the generator
 *     does in front of them. And that a failed `persist` leaves nothing behind is
 *     Postgres's transaction guarantee — the stub runs the callback and rethrows,
 *     so the tests assert the *job* fails and that no completed path wrote a story.
 *
 * The Anthropic client is mocked, which `general.md §5` permits explicitly:
 * external network boundaries are the one allowed mock.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id: string };

const store = vi.hoisted(() => ({
  worlds: [] as Row[],
  stories: [] as Row[],
  storyTranslations: [] as Row[],
  pages: [] as Row[],
  pageTranslations: [] as Row[],
  jobs: [] as Row[],
  /** Every `create` the generator issued, so the draft guarantee is checkable. */
  creates: [] as Array<{ table: string; data: Record<string, unknown> }>,
}));

const ai = vi.hoisted(() => ({ generateStructured: vi.fn() }));

vi.mock("../claude.js", () => ({ generateStructured: ai.generateStructured }));

vi.mock("../../../lib/prisma.js", () => {
  let counter = 0;
  function nextId(prefix: string): string {
    counter += 1;
    return `${prefix}-${counter}`;
  }

  /** Splits the nested `translations.create` off and records both halves. */
  function create(
    table: string,
    rows: Row[],
    prefix: string,
    data: Record<string, unknown>,
    translationsInto: Row[],
    foreignKey: string,
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
        translationsInto.push({
          id: nextId("translation"),
          [foreignKey]: row.id,
          ...one,
        });
      }
    }
    return row;
  }

  const client = {
    world: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.worlds.find((one) => one.id === where.id) ?? null,
    },
    story: {
      findUnique: async ({ where }: { where: { slug: string } }) =>
        store.stories.find((one) => one.slug === where.slug) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) =>
        create(
          "story",
          store.stories,
          "story",
          data,
          store.storyTranslations,
          "storyId",
        ),
    },
    storyPage: {
      create: async ({ data }: { data: Record<string, unknown> }) =>
        create(
          "storyPage",
          store.pages,
          "page",
          data,
          store.pageTranslations,
          "storyPageId",
        ),
    },
    aIGenerationJob: {
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

const { generateStory } = await import("./story.js");

const WORLD_ID = "33333333-3333-4333-8333-333333333333";
const USAGE = { inputTokens: 1200, outputTokens: 2400 };

const CHARACTERS = [
  {
    name: "Bina",
    kind: "rabbit",
    visualDescription:
      "A small white rabbit with one grey ear and a red scarf.",
  },
];

function validOutput({
  languages = ["en", "bn"] as Array<"en" | "bn">,
  pageCount = 7,
  pageNumbers,
}: {
  languages?: Array<"en" | "bn">;
  pageCount?: number;
  pageNumbers?: number[];
} = {}) {
  const localized = (text: string) =>
    Object.fromEntries(languages.map((one) => [one, `${text} (${one})`]));

  const numbers =
    pageNumbers ?? Array.from({ length: pageCount }, (_, index) => index + 1);

  return {
    title: localized("Bina Shares"),
    moral: localized("Sharing makes play better"),
    characterDescriptions: CHARACTERS,
    pages: numbers.map((pageNumber) => ({
      pageNumber,
      text: localized(`Page ${pageNumber}`),
      illustrationPrompt: `Cartoon scene: Bina the rabbit, page ${pageNumber}.`,
    })),
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    gradeLevels: ["KG1"] as Array<"NURSERY" | "KG1" | "KG2">,
    theme: "Sharing with friends",
    worldId: WORLD_ID,
    languages: ["en", "bn"] as Array<"en" | "bn">,
    ...overrides,
  };
}

/** Every `create` for one table, as the generator sent it. */
function creates(table: string) {
  return store.creates
    .filter((one) => one.table === table)
    .map((one) => one.data);
}

beforeEach(() => {
  store.worlds = [{ id: WORLD_ID, name: "Jungle", slug: "jungle" }];
  store.stories = [];
  store.storyTranslations = [];
  store.pages = [];
  store.pageTranslations = [];
  store.jobs = [];
  store.creates = [];
  ai.generateStructured.mockReset();
  ai.generateStructured.mockResolvedValue({ raw: validOutput(), usage: USAGE });
});

describe("what a successful generation writes", () => {
  it("creates a story with its pages and reports the job", async () => {
    const result = await generateStory(request());

    expect(result.status).toBe("awaiting_review");
    expect(store.stories).toHaveLength(1);
    expect(store.pages).toHaveLength(7);
    expect(store.jobs[0].status).toBe("awaiting_review");
  });

  it("never writes a status — every row takes the draft default (FR-AI-07)", async () => {
    await generateStory(request());

    const written = store.creates.filter(({ table }) =>
      ["story", "storyPage"].includes(table),
    );
    expect(written).not.toHaveLength(0);
    for (const { data } of written) {
      expect(data).not.toHaveProperty("status");
    }
  });

  it("stamps the story with the creating job", async () => {
    const { jobId } = await generateStory(request());

    expect(creates("story")[0].aiJobId).toBe(jobId);
  });

  it("numbers the pages 1..N as their sortOrder", async () => {
    await generateStory(request());

    expect(creates("storyPage").map((one) => one.sortOrder)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("stores each page's illustration prompt for the image pipeline (file 36)", async () => {
    await generateStory(request());

    const prompts = creates("storyPage").map((one) => one.illustrationPrompt);
    expect(prompts).toHaveLength(7);
    for (const prompt of prompts) {
      expect(String(prompt)).toContain("Bina");
    }
  });

  it("writes both locales in one job, not one job per language (FR-I18N-01)", async () => {
    // The recorded decision in `schemas/localized.ts`: both languages come back
    // from a single call, so a bilingual story is one review item whose pages tell
    // the same story in each language — not two drafts to reconcile.
    await generateStory(request({ languages: ["en", "bn"] }));

    expect(store.jobs).toHaveLength(1);
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    expect(store.storyTranslations.map((one) => one.language).sort()).toEqual([
      "bn",
      "en",
    ]);
  });

  it("writes a page translation per requested locale", async () => {
    await generateStory(request());

    expect(store.pageTranslations).toHaveLength(14);
    const first = store.pageTranslations.filter(
      (one) => one.storyPageId === store.pages[0].id,
    );
    expect(first.map((one) => one.language).sort()).toEqual(["bn", "en"]);
    expect(first.find((one) => one.language === "bn")?.text).toContain("(bn)");
  });

  it("gives each locale the title and moral the model wrote for it", async () => {
    // `StoryTranslation.title` and `.moral` are child-facing — file 26 reads the
    // moral aloud — so an English sentence in the Bangla row would be
    // untranslated child-facing text that looks filled in (FR-I18N-01).
    await generateStory(request());

    const byLanguage = Object.fromEntries(
      store.storyTranslations.map((one) => [one.language, one]),
    );
    expect(byLanguage.en.title).toBe("Bina Shares (en)");
    expect(byLanguage.bn.title).toBe("Bina Shares (bn)");
    expect(byLanguage.bn.moral).toBe("Sharing makes play better (bn)");
  });

  it("keeps the admin's theme as the row's internal label", async () => {
    await generateStory(request());

    const [story] = creates("story");
    expect(story.theme).toBe("Sharing with friends");
    expect(story.title).toBe("Bina Shares (en)");
    expect(story.slug).toBe("bina-shares-en");
    expect(story.gradeLevels).toEqual(["KG1"]);
  });

  it("keeps the character descriptions in the job rather than in rows", async () => {
    await generateStory(request());

    // File 36 reads them for illustration consistency and file 37 promotes them
    // into `CharacterSheet` rows on approval — creating those now would leave
    // orphans behind a rejected story.
    const rawOutput = store.jobs[0].rawOutput as {
      parsed: { characterDescriptions: Array<{ name: string }> };
    };
    expect(rawOutput.parsed.characterDescriptions[0].name).toBe("Bina");
  });

  it("records the world and the prompt the model actually saw", async () => {
    await generateStory(request());

    const input = store.jobs[0].input as Record<string, string>;
    expect(input.userPrompt).toContain("Jungle (jungle)");
    expect(input.userPrompt).toContain("Sharing with friends");
    expect(input.userPrompt).toContain("exactly 7 pages");
    expect(input.systemPrompt).toContain("aged 3 to 6");
  });
});

describe("page count", () => {
  it("defaults to seven pages", async () => {
    await generateStory(request());

    expect(store.pages).toHaveLength(7);
  });

  it("honours the count the admin asked for", async () => {
    ai.generateStructured.mockResolvedValue({
      raw: validOutput({ pageCount: 6 }),
      usage: USAGE,
    });

    await generateStory(request({ pageCount: 6 }));

    expect(store.pages).toHaveLength(6);
  });

  it("rejects a response with the wrong number of pages", async () => {
    ai.generateStructured.mockResolvedValue({
      raw: validOutput({ pageCount: 8 }),
      usage: USAGE,
    });

    const result = await generateStory(request({ pageCount: 6 }));

    expect(result.status).toBe("failed");
    expect(store.stories).toHaveLength(0);
  });
});

describe("locales", () => {
  it("writes one translation set per requested locale and no more", async () => {
    ai.generateStructured.mockResolvedValue({
      raw: validOutput({ languages: ["en"] }),
      usage: USAGE,
    });

    await generateStory(request({ languages: ["en"] }));

    expect(store.storyTranslations).toHaveLength(1);
    expect(store.storyTranslations[0].language).toBe("en");
    expect(store.pageTranslations).toHaveLength(7);
  });

  it("takes the slug from the theme when English was not requested", async () => {
    // A Bangla title reduces to an empty ASCII slug, so the admin's own words are
    // the only readable handle left.
    ai.generateStructured.mockResolvedValue({
      raw: {
        ...validOutput({ languages: ["bn"] }),
        title: { bn: "বিনা ভাগ করে" },
        moral: { bn: "ভাগ করলে খেলা ভালো হয়" },
      },
      usage: USAGE,
    });

    await generateStory(
      request({ languages: ["bn"], theme: "Sharing with friends" }),
    );

    expect(creates("story")[0].slug).toBe("sharing-with-friends");
  });
});

describe("slugs", () => {
  it("suffixes rather than colliding with a story that already exists", async () => {
    // `Story.slug` is unique across the whole table, so two stories generated a
    // month apart from the same title is the normal case.
    store.stories.push({ id: "existing", slug: "bina-shares-en" });

    await generateStory(request());

    expect(creates("story")[0].slug).toBe("bina-shares-en-2");
  });
});

describe("what is refused before a token is spent", () => {
  it("rejects a world id that names nothing", async () => {
    await expect(
      generateStory(
        request({ worldId: "77777777-7777-4777-8777-777777777777" }),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(store.jobs).toHaveLength(0);
  });
});

describe("when the model gets it wrong", () => {
  it("retries once when the page numbers have a gap, then succeeds", async () => {
    ai.generateStructured
      .mockResolvedValueOnce({
        raw: validOutput({ pageNumbers: [1, 2, 3, 5, 6, 7, 8] }),
        usage: USAGE,
      })
      .mockResolvedValueOnce({ raw: validOutput(), usage: USAGE });

    const result = await generateStory(request());

    expect(result.status).toBe("awaiting_review");
    expect(ai.generateStructured).toHaveBeenCalledTimes(2);

    const retry = ai.generateStructured.mock.calls[1][0] as {
      messages: Array<{ content: string }>;
    };
    expect(retry.messages).toHaveLength(2);
    expect(retry.messages[1].content).toContain("failed schema validation");
    expect(retry.messages[1].content).toContain("pages.3.pageNumber");

    // The retried story is the one that landed, numbered 1..7.
    expect(creates("storyPage").map((one) => one.sortOrder)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("retries once when an illustration prompt names no character", async () => {
    const unusable = validOutput();
    unusable.pages[2].illustrationPrompt =
      "Cartoon scene: a small animal hops.";

    ai.generateStructured
      .mockResolvedValueOnce({ raw: unusable, usage: USAGE })
      .mockResolvedValueOnce({ raw: validOutput(), usage: USAGE });

    const result = await generateStory(request());

    expect(result.status).toBe("awaiting_review");
    const retry = ai.generateStructured.mock.calls[1][0] as {
      messages: Array<{ content: string }>;
    };
    expect(retry.messages[1].content).toContain("pages.2.illustrationPrompt");
  });

  it("fails the job and writes nothing after two invalid responses", async () => {
    ai.generateStructured.mockResolvedValue({
      raw: validOutput({ languages: ["en"] }),
      usage: USAGE,
    });

    const result = await generateStory(request());

    expect(result.status).toBe("failed");
    expect(store.stories).toHaveLength(0);
    expect(store.pages).toHaveLength(0);
    expect(store.jobs[0].status).toBe("failed");
  });
});
