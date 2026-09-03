/**
 * Batch illustration (file 36, FR-AI-05, FR-AI-09, FR-CMS-05, FR-AI-07).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* Arrays per table, and the writes land in them.
 *  2. *Assert the query, not just the result.* Two claims here are queries: that
 *     `StoryPage.illustrationAssetId` is never written (the stub throws on every
 *     `storyPage` write method, so the deferral is enforced rather than only
 *     checked afterwards), and that the sheets applied are the story world's plus
 *     the world-less ones (the stub applies the `OR` clause to a sheets array).
 *  3. *`where` clauses are not the whole guard.* Not applicable: nothing here
 *     reads student-facing content.
 *  4. *Name what the stub cannot prove.* That a rolled-back `persist` leaves no
 *     asset row is Postgres's transaction guarantee; the stub runs the callback
 *     and rethrows, so the test asserts the job failed and no asset was written
 *     on the completed path.
 *
 * Gemini and the Cloudinary upload are mocked, which `general.md §5` permits
 * explicitly: external network boundaries are the one allowed mock.
 * `buildIllustrationPrompt` is deliberately *not* mocked — the prompt is the
 * FR-AI-09 mechanism, so this suite reads the real one out of the job record.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id: string };

const store = vi.hoisted(() => ({
  stories: [] as Row[],
  sheets: [] as Row[],
  mediaAssets: [] as Row[],
  jobs: [] as Row[],
  writes: [] as Array<{
    table: string;
    op: string;
    data?: Record<string, unknown>;
  }>,
}));

const image = vi.hoisted(() => ({ generateIllustration: vi.fn() }));
const upload = vi.hoisted(() => ({ uploadBuffer: vi.fn() }));

vi.mock("../gemini.js", async (importOriginal) => ({
  // `buildIllustrationPrompt` stays real: it *is* the character-consistency
  // mechanism, and this suite asserts the string it produces.
  ...(await importOriginal<typeof import("../gemini.js")>()),
  generateIllustration: image.generateIllustration,
}));

vi.mock("../../mediaService.js", async (importOriginal) => ({
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
    throw new Error(`${table}.${op} must not be called by the image batch`);
  };

  const client = {
    story: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.stories.find((one) => one.id === where.id) ?? null,
    },
    // The table holding the illustration foreign key. Every write is a throw, so
    // "attachment is file 37's" is enforced by the stub.
    storyPage: {
      update: forbid("storyPage", "update"),
      updateMany: forbid("storyPage", "updateMany"),
    },
    characterSheet: {
      findMany: async ({
        where,
      }: {
        where: { OR: Array<{ worldId: string | null }> };
      }) => {
        const wanted = where.OR.map((clause) => clause.worldId);
        return store.sheets
          .filter((sheet) => wanted.includes(sheet.worldId as string | null))
          .sort((left, right) =>
            String(left.slug).localeCompare(String(right.slug)),
          );
      },
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

const { generateIllustrationBatch } = await import("./illustration.js");

const STORY_ID = "story-a";
const WORLD_ID = "world-jungle";
const OTHER_WORLD_ID = "world-ocean";

const RABBIT_DESCRIPTION =
  "a small white rabbit with one grey ear, wearing a red scarf, knee-high to a child";
const OWL_DESCRIPTION =
  "a round brown owl with large round glasses and a green bow tie";

function page(
  id: string,
  sortOrder: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    sortOrder,
    illustrationPrompt: `Nibbles on page ${sortOrder}`,
    illustrationAssetId: null,
    ...overrides,
  };
}

function storyWith(pages: Array<Record<string, unknown>>): Row {
  return { id: STORY_ID, worldId: WORLD_ID, pages };
}

function findJob(id: unknown): Row {
  const job = store.jobs.find((one) => one.id === id);
  if (!job) throw new Error(`no job ${String(id)}`);
  return job;
}

function resolvedPrompt(id: unknown): string {
  const input = findJob(id).input as Record<string, unknown>;
  return String(input.resolvedPrompt);
}

beforeEach(() => {
  store.stories = [];
  store.sheets = [];
  store.mediaAssets = [];
  store.jobs = [];
  store.writes = [];

  image.generateIllustration.mockReset();
  image.generateIllustration.mockResolvedValue(Buffer.from([9, 9, 9]));
  upload.uploadBuffer.mockReset();
  upload.uploadBuffer.mockImplementation(
    async () => "https://res.cloudinary.com/test-cloud/image/upload/page.png",
  );
});

describe("which pages a batch draws", () => {
  it("draws only the pages with a brief and no picture", async () => {
    store.stories.push(
      storyWith([
        page("page-1", 1, { illustrationAssetId: "asset-existing" }),
        page("page-2", 2),
        // No brief: a hand-authored page has nothing to draw from.
        page("page-3", 3, { illustrationPrompt: null }),
      ]),
    );

    const result = await generateIllustrationBatch({ storyId: STORY_ID });

    expect(result.jobIds).toHaveLength(1);
    // Two candidates, one of which already had a picture. The page with no brief
    // is not a candidate at all, so it is not counted as skipped either.
    expect(result.skipped).toBe(1);
  });

  it("404s on a story that does not exist", async () => {
    await expect(
      generateIllustrationBatch({ storyId: "nope" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("creates nothing while a page's picture is awaiting review", async () => {
    store.stories.push(storyWith([page("page-1", 1)]));

    const first = await generateIllustrationBatch({ storyId: STORY_ID });
    expect(first.jobIds).toHaveLength(1);

    const second = await generateIllustrationBatch({ storyId: STORY_ID });

    expect(second.jobIds).toEqual([]);
    expect(second.skipped).toBe(1);
    expect(image.generateIllustration).toHaveBeenCalledTimes(1);
  });
});

describe("character consistency (FR-AI-09)", () => {
  beforeEach(() => {
    store.sheets.push(
      {
        id: "sheet-1",
        slug: "nibbles",
        name: "Nibbles",
        worldId: WORLD_ID,
        description: RABBIT_DESCRIPTION,
      },
      {
        id: "sheet-2",
        slug: "professor-hoot",
        name: "Professor Hoot",
        worldId: null,
        description: OWL_DESCRIPTION,
      },
      {
        id: "sheet-3",
        slug: "shelly",
        name: "Shelly",
        worldId: OTHER_WORLD_ID,
        description: "a small green turtle with a blue shell",
      },
    );
  });

  it("puts the sheet description ahead of the page's scene text", async () => {
    store.stories.push(storyWith([page("page-1", 1)]));

    const result = await generateIllustrationBatch({ storyId: STORY_ID });
    const prompt = resolvedPrompt(result.jobIds[0]);

    expect(prompt.indexOf(RABBIT_DESCRIPTION)).toBeLessThan(
      prompt.indexOf("Scene: Nibbles on page 1"),
    );
  });

  it("gives two pages the identical character block", async () => {
    // The requirement itself: page 3 and page 7 differ only after `Scene:`, so
    // the same rabbit is described to the model both times.
    store.stories.push(storyWith([page("page-3", 3), page("page-7", 7)]));

    const result = await generateIllustrationBatch({ storyId: STORY_ID });
    const blocks = result.jobIds.map((id) => {
      const prompt = resolvedPrompt(id);
      return prompt.slice(0, prompt.indexOf("Scene:"));
    });

    expect(blocks[0]).toBe(blocks[1]);
    expect(resolvedPrompt(result.jobIds[0])).not.toBe(
      resolvedPrompt(result.jobIds[1]),
    );
  });

  it("applies the story world's sheets and the world-less ones, and no others", async () => {
    store.stories.push(storyWith([page("page-1", 1)]));

    const result = await generateIllustrationBatch({ storyId: STORY_ID });
    const prompt = resolvedPrompt(result.jobIds[0]);

    expect(prompt).toContain(RABBIT_DESCRIPTION);
    expect(prompt).toContain(OWL_DESCRIPTION);
    // Another world's turtle has no business in a jungle story's prompt.
    expect(prompt).not.toContain("blue shell");
  });

  it("records the character names alongside the resolved prompt", async () => {
    store.stories.push(storyWith([page("page-1", 1)]));

    const result = await generateIllustrationBatch({ storyId: STORY_ID });

    expect(findJob(result.jobIds[0]).input).toMatchObject({
      characterNames: ["Nibbles", "Professor Hoot"],
      illustrationPrompt: "Nibbles on page 1",
    });
  });

  it("still draws a story whose world has no sheets", async () => {
    store.sheets = [];
    store.stories.push(storyWith([page("page-1", 1)]));

    const result = await generateIllustrationBatch({ storyId: STORY_ID });

    expect(result.jobIds).toHaveLength(1);
    // A heading with nothing under it would tell the model there are characters
    // it has not been told about.
    expect(resolvedPrompt(result.jobIds[0])).not.toContain(
      "Recurring characters",
    );
  });
});

describe("what an illustration job records", () => {
  beforeEach(() => {
    store.stories.push(storyWith([page("page-1", 4)]));
  });

  it("writes one MediaAsset with kind image, no language and the job id", async () => {
    const result = await generateIllustrationBatch({ storyId: STORY_ID });

    expect(store.mediaAssets).toHaveLength(1);
    expect(store.mediaAssets[0]).toMatchObject({
      kind: "image",
      // A picture has no language; stamping one would hide it from the other
      // locale's media filter.
      language: null,
      aiJobId: result.jobIds[0],
    });
  });

  it("leaves the job awaiting_review with the page it was drawn for", async () => {
    const result = await generateIllustrationBatch({ storyId: STORY_ID });

    expect(findJob(result.jobIds[0])).toMatchObject({
      type: "image",
      status: "awaiting_review",
    });
    expect(findJob(result.jobIds[0]).input).toMatchObject({
      entity: "story",
      entityId: STORY_ID,
      targetTable: "StoryPage",
      targetId: "page-1",
      sortOrder: 4,
    });
  });

  it("writes no illustration foreign key on the page (FR-CMS-05)", async () => {
    await generateIllustrationBatch({ storyId: STORY_ID });

    expect(store.mediaAssets).toHaveLength(1);
    expect(
      store.writes.filter((write) => write.table !== "mediaAsset"),
    ).toEqual([]);
  });

  it("fails the job rather than throwing when the model returns no image", async () => {
    image.generateIllustration.mockRejectedValue(
      new Error("Gemini returned no image"),
    );

    const result = await generateIllustrationBatch({ storyId: STORY_ID });

    expect(findJob(result.jobIds[0]).status).toBe("failed");
    expect(store.mediaAssets).toHaveLength(0);
  });

  it("counts the failed jobs, so a batch that drew nothing does not read as done", async () => {
    // Same claim as `narration.test.ts`: the ids alone cannot distinguish a page
    // drawn from a page the model refused, and the CMS reported both as drawn.
    image.generateIllustration.mockRejectedValue(
      new Error("Gemini returned no image"),
    );

    const result = await generateIllustrationBatch({ storyId: STORY_ID });

    expect(result.jobIds).toHaveLength(1);
    expect(result.failed).toBe(1);
  });

  it("reports zero failures when the page is drawn", async () => {
    const result = await generateIllustrationBatch({ storyId: STORY_ID });

    expect(result.jobIds).toHaveLength(1);
    expect(result.failed).toBe(0);
  });
});

describe("the daily image cap", () => {
  it("refuses the whole batch rather than drawing part of it", async () => {
    const { env } = await import("../../../lib/env.js");
    for (let index = 0; index < env.AI_IMAGE_JOBS_PER_DAY - 1; index += 1) {
      store.jobs.push({
        id: `filler-${index}`,
        type: "image",
        status: "awaiting_review",
        createdAt: new Date(),
      });
    }
    store.stories.push(storyWith([page("page-1", 1), page("page-2", 2)]));

    await expect(
      generateIllustrationBatch({ storyId: STORY_ID }),
    ).rejects.toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });

    expect(image.generateIllustration).not.toHaveBeenCalled();
    expect(store.mediaAssets).toHaveLength(0);
  });
});
