/**
 * Story Library read API — behaviour, leak-proofing, and the locale fallback.
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` (no test
 * database exists yet). The two consequences that shape this file:
 *
 *  - Content safety is asserted on the **`where` clause** each endpoint sends,
 *    because a stub cannot show that a draft row stayed in the database. That is
 *    where `status: "published"`, the grade condition and the world gate live.
 *  - The ledger is modelled as an in-memory array the story stub reads through, not
 *    as a one-shot `mockResolvedValue` per case. "This child finished this story"
 *    is state, and a completion flag asserted against a canned answer would prove
 *    nothing about how it is derived.
 */
import type { ChildProfile, Parent } from "@kidlearn/db";
import {
  StoryDetailResponseSchema,
  StoryListResponseSchema,
} from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertContract } from "../openapi/assert-contract.js";

const db = vi.hoisted(() => ({
  parentFindUnique: vi.fn(),
  childFindFirst: vi.fn(),
  storyFindMany: vi.fn(),
  storyFindFirst: vi.fn(),
  ledgerFindMany: vi.fn(),
  ledgerFindFirst: vi.fn(),
  screenTimeFindUnique: vi.fn(),
  sessionEventFindMany: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    parent: { findUnique: db.parentFindUnique },
    childProfile: { findFirst: db.childFindFirst },
    story: { findMany: db.storyFindMany, findFirst: db.storyFindFirst },
    rewardLedger: {
      findMany: db.ledgerFindMany,
      findFirst: db.ledgerFindFirst,
    },
    screenTimeSetting: { findUnique: db.screenTimeFindUnique },
    sessionEvent: { findMany: db.sessionEventFindMany },
  },
}));

const { app } = await import("../app.js");
const { auth } = await import("../lib/auth.js");

const SESSION_USER = {
  id: "user_1",
  email: "parent@example.com",
  name: "Parent One",
  image: null,
};

const PARENT: Parent = {
  id: "parent_1",
  userId: SESSION_USER.id,
  googleId: "google_profile_1",
  email: SESSION_USER.email,
  name: SESSION_USER.name,
  avatarUrl: null,
  pinHash: null,
  consentGivenAt: null,
  consentVersion: null,
  pinFailedCount: 0,
  pinLockoutStrikes: 0,
  pinLockedUntil: null,
  deleteToken: null,
  deleteTokenExpiresAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const SHARING_MONKEY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MISSING_ID = "99999999-9999-4999-8999-999999999999";

function childProfile(overrides: Partial<ChildProfile> = {}): ChildProfile {
  return {
    id: "child_1",
    firstName: "Ava",
    age: 4,
    gradeLevel: "NURSERY",
    preferredLanguage: "en",
    avatarCharacterId: null,
    parentId: PARENT.id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function signInAs(child: ChildProfile | null) {
  // `getSession` returns a deep better-auth type; only the fields the middleware
  // reads are supplied, so the shape is narrowed at this boundary.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: SESSION_USER,
    session: {
      id: "session_1",
      userId: SESSION_USER.id,
      activeChildProfileId: child?.id ?? null,
    },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
  db.parentFindUnique.mockResolvedValue(PARENT);
  db.childFindFirst.mockResolvedValue(child);
}

const JUNGLE_MASCOT = {
  id: "asset_mascot",
  url: "/dev/mascot-jungle-monkey.png",
  kind: "image" as const,
  language: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const JUNGLE_WORLD = {
  id: "world_jungle",
  slug: "jungle",
  // The admin label; what a child reads comes from `translations`.
  name: "Jungle World",
  translations: [
    { language: "en", name: "Jungle World" },
    { language: "bn", name: "জঙ্গল জগৎ" },
  ],
  palette: { primary: "#2E7D32", secondary: "#FDD835", bg: "#E8F5E9" },
  mascotAssetId: JUNGLE_MASCOT.id,
  mascotAsset: JUNGLE_MASCOT,
  status: "published" as const,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

/** Both locales, plus a title narration that exists in English only. */
function bilingualTranslations() {
  return [
    {
      language: "en",
      title: "The Sharing Monkey",
      moral: "Sharing makes playing better",
      titleAudioAsset: { url: "/dev/story-sharing-monkey-title.en.mp3" },
    },
    {
      language: "bn",
      title: "ভাগ করে নেওয়া বানর",
      moral: "ভাগ করে নিলে খেলা আরও ভালো হয়",
      titleAudioAsset: null,
    },
  ];
}

function storyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SHARING_MONKEY_ID,
    slug: "the-sharing-monkey",
    title: "The Sharing Monkey",
    theme: "sharing",
    worldId: JUNGLE_WORLD.id,
    world: JUNGLE_WORLD,
    gradeLevels: ["NURSERY", "KG1"],
    status: "published",
    coverAssetId: "asset_cover",
    coverAsset: { url: "/dev/story-sharing-monkey-cover.png" },
    translations: bilingualTranslations(),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    _count: { pages: 5 },
    ...overrides,
  };
}

function pageRow(sortOrder: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `page_${sortOrder}`,
    storyId: SHARING_MONKEY_ID,
    sortOrder,
    illustrationAsset: { url: `/dev/story-sharing-monkey-${sortOrder}.png` },
    translations: [
      {
        language: "en",
        text: `English page ${sortOrder}.`,
        narrationAudioAsset: { url: `/dev/sharing-monkey-${sortOrder}.en.mp3` },
        // What every MVP row holds: the voice pipeline (file 36) produces spans.
        narrationTimings: null,
      },
      {
        language: "bn",
        text: `বাংলা পাতা ${sortOrder}।`,
        narrationAudioAsset: null,
        narrationTimings: null,
      },
    ],
    ...overrides,
  };
}

const ENGLISH_TIMINGS = {
  unit: "word",
  spans: [
    { start: 0, end: 7, tMs: 0 },
    { start: 8, end: 12, tMs: 420 },
  ],
};

/**
 * The ledger as state. `completeStory` writes the row file 26 will write; nothing
 * in this suite reaches the flag by changing what a mock returns.
 */
let ledger: { childId: string; sourceType: string; sourceId: string | null }[] =
  [];

function completeStory(childId: string, storyId: string) {
  ledger.push({
    childId,
    sourceType: "story_completion",
    sourceId: storyId,
  });
}

type LedgerWhere = {
  childId?: string;
  sourceType?: string;
  sourceId?: string;
};

function queryLedger(where: LedgerWhere | undefined) {
  return ledger.filter(
    (row) =>
      (where?.childId === undefined || row.childId === where.childId) &&
      (where?.sourceType === undefined ||
        row.sourceType === where.sourceType) &&
      (where?.sourceId === undefined || row.sourceId === where.sourceId),
  );
}

beforeEach(() => {
  for (const fn of Object.values(db)) {
    fn.mockReset();
  }
  ledger = [];
  db.storyFindMany.mockResolvedValue([]);
  db.storyFindFirst.mockResolvedValue(null);
  db.ledgerFindMany.mockImplementation(
    ({ where }: { where?: LedgerWhere } = {}) =>
      Promise.resolve(
        queryLedger(where).map((row) => ({ sourceId: row.sourceId })),
      ),
  );
  db.ledgerFindFirst.mockImplementation(
    ({ where }: { where?: LedgerWhere } = {}) =>
      Promise.resolve(
        queryLedger(where).map(() => ({ id: "ledger_1" }))[0] ?? null,
      ),
  );
  // File 28 put `enforceScreenTime` in front of the detail route below, so it now
  // reads the screen-time policy and the presence log on the way through. Both
  // default to "no policy, no minutes" — the state every test in this file is
  // about. The gate itself is exercised in `screen-time.test.ts`.
  db.screenTimeFindUnique.mockResolvedValue(null);
  db.sessionEventFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("story route guards", () => {
  it("returns 401 UNAUTHORIZED when the request carries no session", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app).get("/api/content/stories");

    expect(res.status).toBe(401);
    expect(db.storyFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 FORBIDDEN when the session has no active child profile", async () => {
    signInAs(null);

    const res = await request(app).get("/api/content/stories");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(db.storyFindMany).not.toHaveBeenCalled();
  });

  it("rejects a malformed story id at the boundary before querying", async () => {
    signInAs(childProfile());

    const res = await request(app).get("/api/content/stories/not-a-uuid");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(db.storyFindFirst).not.toHaveBeenCalled();
  });
});

describe("GET /api/content/stories", () => {
  it("serves a cover with its world theming and page count", async () => {
    signInAs(childProfile());
    db.storyFindMany.mockResolvedValue([storyRow()]);

    const res = await request(app).get("/api/content/stories");

    expect(res.status).toBe(200);
    assertContract(
      StoryListResponseSchema,
      res.body,
      "GET /api/content/stories",
    );
    expect(res.body.data.stories).toEqual([
      {
        id: SHARING_MONKEY_ID,
        slug: "the-sharing-monkey",
        title: "The Sharing Monkey",
        titleAudioUrl: "/dev/story-sharing-monkey-title.en.mp3",
        locale: "en",
        world: {
          id: "world_jungle",
          slug: "jungle",
          name: "Jungle World",
          palette: { primary: "#2E7D32", secondary: "#FDD835", bg: "#E8F5E9" },
          mascot: {
            id: "asset_mascot",
            url: "/dev/mascot-jungle-monkey.png",
            kind: "image",
          },
        },
        coverImageUrl: "/dev/story-sharing-monkey-cover.png",
        pageCount: 5,
        completed: false,
      },
    ]);
  });

  it("asks Prisma only for published stories tagged for this child's grade", async () => {
    signInAs(childProfile({ gradeLevel: "KG1" }));

    await request(app).get("/api/content/stories");

    // The draft story and the Nursery-only one never leave the database: this
    // clause is what keeps them there, and asserting it is how a stubbed suite
    // can show that at all (`general.md §5`, rule 2).
    expect(db.storyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "published",
          gradeLevels: { has: "KG1" },
          // A story in a draft world would theme its cover from unreviewed
          // content, so the world's own status gates the story too.
          world: { is: { status: "published" } },
        },
      }),
    );
  });

  it("returns an empty library rather than an error when nothing matches the grade", async () => {
    signInAs(childProfile({ gradeLevel: "KG2" }));
    db.storyFindMany.mockResolvedValue([]);

    const res = await request(app).get("/api/content/stories");

    expect(res.status).toBe(200);
    expect(res.body.data.stories).toEqual([]);
  });

  it("serves Bangla titles to a Bangla child", async () => {
    signInAs(childProfile({ preferredLanguage: "bn" }));
    db.storyFindMany.mockResolvedValue([storyRow()]);

    const res = await request(app).get("/api/content/stories");

    expect(res.body.data.stories[0]).toMatchObject({
      title: "ভাগ করে নেওয়া বানর",
      locale: "bn",
      world: expect.objectContaining({ name: "জঙ্গল জগৎ" }),
    });
  });

  it("falls back to English for a story that has no Bangla translation (FR-STORY-05)", async () => {
    signInAs(childProfile({ preferredLanguage: "bn" }));
    db.storyFindMany.mockResolvedValue([
      storyRow({
        translations: [bilingualTranslations()[0]],
      }),
    ]);

    const res = await request(app).get("/api/content/stories");

    // `locale` is what tells the client which language to read the cover aloud
    // in — a Bangla child served an English title must not be narrated as Bangla.
    expect(res.body.data.stories[0]).toMatchObject({
      title: "The Sharing Monkey",
      locale: "en",
    });
  });

  it("keeps the title audio falling back independently of the title", async () => {
    signInAs(childProfile({ preferredLanguage: "bn" }));
    db.storyFindMany.mockResolvedValue([storyRow()]);

    // Bangla title, English narration: the Bangla translation row exists but
    // carries no recording, and a title in one language is not a reason to
    // withhold the only voice-over there is.
    expect(
      (await request(app).get("/api/content/stories")).body.data.stories[0],
    ).toMatchObject({
      title: "ভাগ করে নেওয়া বানর",
      titleAudioUrl: "/dev/story-sharing-monkey-title.en.mp3",
    });
  });

  it("names an untranslated story by its admin label rather than leaving the cover blank", async () => {
    signInAs(childProfile());
    db.storyFindMany.mockResolvedValue([storyRow({ translations: [] })]);

    const res = await request(app).get("/api/content/stories");

    expect(res.body.data.stories[0].title).toBe("The Sharing Monkey");
  });

  it("marks a story completed only once a story_completion grant exists", async () => {
    signInAs(childProfile());
    db.storyFindMany.mockResolvedValue([storyRow()]);

    const before = await request(app).get("/api/content/stories");
    expect(before.body.data.stories[0].completed).toBe(false);

    completeStory("child_1", SHARING_MONKEY_ID);

    const after = await request(app).get("/api/content/stories");
    expect(after.body.data.stories[0].completed).toBe(true);
  });

  it("does not count another child's completions, or another source's grants", async () => {
    signInAs(childProfile());
    db.storyFindMany.mockResolvedValue([storyRow()]);
    completeStory("child_2", SHARING_MONKEY_ID);
    ledger.push({
      childId: "child_1",
      sourceType: "lesson_completion",
      sourceId: SHARING_MONKEY_ID,
    });

    const res = await request(app).get("/api/content/stories");

    expect(res.body.data.stories[0].completed).toBe(false);
  });

  it("reads every completion in one query rather than one per story", async () => {
    signInAs(childProfile());
    db.storyFindMany.mockResolvedValue([
      storyRow(),
      storyRow({ id: "story_2", slug: "dot-counts-the-fish" }),
      storyRow({ id: "story_3", slug: "the-shy-star" }),
    ]);

    await request(app).get("/api/content/stories");

    // Twenty covers must not be twenty-one round trips on the first screen a
    // child opens (FR-STORY-08).
    expect(db.ledgerFindMany).toHaveBeenCalledTimes(1);
    expect(db.ledgerFindMany).toHaveBeenCalledWith({
      where: { childId: "child_1", sourceType: "story_completion" },
      select: { sourceId: true },
    });
  });
});

describe("GET /api/content/stories/:id", () => {
  it("serves the story, its moral and its pages in reading order", async () => {
    signInAs(childProfile());
    db.storyFindFirst.mockResolvedValue({
      ...storyRow(),
      pages: [pageRow(1), pageRow(2)],
    });

    const res = await request(app).get(
      `/api/content/stories/${SHARING_MONKEY_ID}`,
    );

    expect(res.status).toBe(200);
    assertContract(
      StoryDetailResponseSchema,
      res.body,
      "GET /api/content/stories/{id}",
    );
    expect(res.body.data.story).toMatchObject({
      id: SHARING_MONKEY_ID,
      title: "The Sharing Monkey",
      moral: "Sharing makes playing better",
      locale: "en",
      completed: false,
      pages: [
        {
          pageNumber: 1,
          illustrationUrl: "/dev/story-sharing-monkey-1.png",
          text: "English page 1.",
          narrationUrl: "/dev/sharing-monkey-1.en.mp3",
        },
        {
          pageNumber: 2,
          illustrationUrl: "/dev/story-sharing-monkey-2.png",
          text: "English page 2.",
          narrationUrl: "/dev/sharing-monkey-2.en.mp3",
        },
      ],
    });
    expect(db.storyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          pages: expect.objectContaining({ orderBy: { sortOrder: "asc" } }),
        }),
      }),
    );
  });

  it("numbers pages from one even when a sortOrder gap was left behind", async () => {
    signInAs(childProfile());
    db.storyFindFirst.mockResolvedValue({
      ...storyRow(),
      // Page 2 was deleted after authoring; the reader must not skip a page.
      pages: [pageRow(1), pageRow(3)],
    });

    const res = await request(app).get(
      `/api/content/stories/${SHARING_MONKEY_ID}`,
    );

    expect(
      res.body.data.story.pages.map(
        (page: { pageNumber: number }) => page.pageNumber,
      ),
    ).toEqual([1, 2]);
  });

  it("resolves page text and narration per field, not per story", async () => {
    signInAs(childProfile({ preferredLanguage: "bn" }));
    db.storyFindFirst.mockResolvedValue({
      ...storyRow(),
      pages: [pageRow(1)],
    });

    const res = await request(app).get(
      `/api/content/stories/${SHARING_MONKEY_ID}`,
    );

    // Bangla text, English narration. Falling back wholesale would read a Bangla
    // child the English story because nobody recorded the Bangla voice-over.
    expect(res.body.data.story.pages[0]).toMatchObject({
      text: "বাংলা পাতা 1।",
      narrationUrl: "/dev/sharing-monkey-1.en.mp3",
    });
  });

  it("serves no timings for a recording that has none (every MVP page)", async () => {
    signInAs(childProfile());
    db.storyFindFirst.mockResolvedValue({
      ...storyRow(),
      pages: [pageRow(1)],
    });

    const res = await request(app).get(
      `/api/content/stories/${SHARING_MONKEY_ID}`,
    );

    // `null`, not an omitted key: the reader renders plain text from one
    // component rather than branching onto a second reading screen.
    expect(res.body.data.story.pages[0].narrationTimings).toBeNull();
  });

  it("takes the narration timings from the same row the clip came from", async () => {
    signInAs(childProfile({ preferredLanguage: "bn" }));
    db.storyFindFirst.mockResolvedValue({
      ...storyRow(),
      pages: [
        pageRow(1, {
          translations: [
            {
              language: "en",
              text: "English page 1.",
              narrationAudioAsset: { url: "/dev/sharing-monkey-1.en.mp3" },
              narrationTimings: ENGLISH_TIMINGS,
            },
            {
              language: "bn",
              text: "বাংলা পাতা ১।",
              narrationAudioAsset: null,
              narrationTimings: null,
            },
          ],
        }),
      ],
    });

    const res = await request(app).get(
      `/api/content/stories/${SHARING_MONKEY_ID}`,
    );

    // Bangla text, English narration — and therefore *English* spans, because a
    // span is a character offset into the text the recording reads. Resolving the
    // two independently would highlight English offsets over Bangla text.
    expect(res.body.data.story.pages[0]).toMatchObject({
      text: "বাংলা পাতা ১।",
      narrationUrl: "/dev/sharing-monkey-1.en.mp3",
      narrationTimings: ENGLISH_TIMINGS,
    });
  });

  it("drops malformed timings rather than serving a blob the reader cannot read", async () => {
    signInAs(childProfile());
    db.storyFindFirst.mockResolvedValue({
      ...storyRow(),
      pages: [
        pageRow(1, {
          translations: [
            {
              language: "en",
              text: "English page 1.",
              narrationAudioAsset: { url: "/dev/sharing-monkey-1.en.mp3" },
              // A pipeline bug, or an admin's hand-edit: `unit` is unknown and
              // the span has no end. JSONB accepts anything; the API must not.
              narrationTimings: { unit: "syllable", spans: [{ start: 0 }] },
            },
          ],
        }),
      ],
    });

    const res = await request(app).get(
      `/api/content/stories/${SHARING_MONKEY_ID}`,
    );

    assertContract(
      StoryDetailResponseSchema,
      res.body,
      "GET /api/content/stories/{id}",
    );
    // The page still reads — an unhighlighted story beats a reader that throws.
    expect(res.body.data.story.pages[0]).toMatchObject({
      narrationUrl: "/dev/sharing-monkey-1.en.mp3",
      narrationTimings: null,
    });
  });

  it("speaks the moral in whichever locale recorded it (FR-STORY-03)", async () => {
    signInAs(childProfile({ preferredLanguage: "bn" }));
    db.storyFindFirst.mockResolvedValue({
      ...storyRow({
        translations: [
          {
            ...bilingualTranslations()[0],
            moralAudioAsset: { url: "/dev/sharing-monkey-moral.en.mp3" },
          },
          { ...bilingualTranslations()[1], moralAudioAsset: null },
        ],
      }),
      pages: [pageRow(1)],
    });

    const res = await request(app).get(
      `/api/content/stories/${SHARING_MONKEY_ID}`,
    );

    // Bangla moral, English recording. The moral is the one line of a story that
    // is otherwise only text, so an English voice-over beats silence for a child
    // who cannot read either language.
    expect(res.body.data.story).toMatchObject({
      moral: "ভাগ করে নিলে খেলা আরও ভালো হয়",
      moralAudioUrl: "/dev/sharing-monkey-moral.en.mp3",
    });
  });

  it("serves no moral rather than the untranslated authoring label", async () => {
    signInAs(childProfile());
    db.storyFindFirst.mockResolvedValue({
      ...storyRow({
        theme: "sharing",
        translations: [{ ...bilingualTranslations()[0], moral: null }],
      }),
      pages: [pageRow(1)],
    });

    const res = await request(app).get(
      `/api/content/stories/${SHARING_MONKEY_ID}`,
    );

    // `Story.theme` is an admin label, not a sentence to read to a child.
    expect(res.body.data.story.moral).toBeNull();
  });

  it("reports a completed story as openable rather than locking it (FR-STORY-06)", async () => {
    signInAs(childProfile());
    db.storyFindFirst.mockResolvedValue({
      ...storyRow(),
      pages: [pageRow(1)],
    });
    completeStory("child_1", SHARING_MONKEY_ID);

    const res = await request(app).get(
      `/api/content/stories/${SHARING_MONKEY_ID}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.story.completed).toBe(true);
    expect(res.body.data.story.pages).toHaveLength(1);
  });

  it("gates the story and its world on the same clause the list uses", async () => {
    signInAs(childProfile({ gradeLevel: "KG1" }));

    await request(app).get(`/api/content/stories/${SHARING_MONKEY_ID}`);

    expect(db.storyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: SHARING_MONKEY_ID,
          status: "published",
          gradeLevels: { has: "KG1" },
          world: { is: { status: "published" } },
        },
      }),
    );
  });

  it("returns a 404 envelope for an unpublished or unknown story", async () => {
    signInAs(childProfile());
    db.storyFindFirst.mockResolvedValue(null);

    const res = await request(app).get(`/api/content/stories/${MISSING_ID}`);

    // Not 403: a draft story must be indistinguishable from one that was never
    // written, or a probe can confirm the row exists (NFR-SAFE-02).
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
