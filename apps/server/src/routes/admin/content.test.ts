/**
 * `/api/admin/content/*` — curriculum CRUD, the publishing workflow and
 * reordering (file 32, FR-CURR-04, FR-CMS-01, FR-CMS-06), plus the character
 * sheets file 36 mounted alongside them (FR-AI-09).
 *
 * Stubs `lib/prisma.js` under the recorded exception in `general.md §5` — no test
 * database exists yet. The four bounds that exception sets are met as follows:
 *
 *  1. *Stub state, not answers.* `store` holds four tables and the stub applies
 *     each route's real `where`, `orderBy`, nested translation writes and
 *     `_max` aggregate to them. "The lesson is `draft`" is therefore a
 *     consequence of what the create wrote, not of a mock told to say so — and
 *     the reorder tests read back rows the reorder itself mutated.
 *  2. *Assert the query, not just the result.* The publish round trip below
 *     applies `publishedForChild` — the exported filter every student query in
 *     file 12 composes — to the row this API just published. A stub cannot run
 *     the student endpoint, but it can prove the row now satisfies the one
 *     condition that endpoint filters on, and stops satisfying it on unpublish.
 *  3. *`where` clauses are not the whole guard.* Not applicable: no response here
 *     is content-gated. This API deliberately returns drafts, and the gate lives
 *     in `routes/content.ts`, where `content.test.ts` covers it.
 *  4. *Name what the stub cannot prove.* Two things. The unique indexes behind
 *     the `409 DUPLICATE_SLUG` path are asserted against `schema.prisma` at the
 *     bottom of this file rather than by inserting a duplicate. And the
 *     Serializable isolation that makes two concurrent transitions safe is
 *     asserted as the level passed to `$transaction`, not by racing two writes.
 */

import { readFileSync } from "node:fs";
import { Prisma } from "@kidlearn/db";
import {
  AdminLessonListResponseSchema,
  AdminLessonResponseSchema,
  AdminSubjectListResponseSchema,
  AdminSubjectResponseSchema,
  AdminTopicListResponseSchema,
  AdminTopicResponseSchema,
  AdminWorldListResponseSchema,
  AdminWorldResponseSchema,
  CharacterSheetListResponseSchema,
  CharacterSheetResponseSchema,
  PromotedCharacterSheetsResponseSchema,
  ReorderedIdsResponseSchema,
} from "@kidlearn/types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishedForChild } from "../../lib/published-for-child.js";
import { assertContract } from "../../openapi/assert-contract.js";

const BASE = "/api/admin/content";

const ADMIN_USER_ID = "user_admin_1";
const PARENT_USER_ID = "user_parent_1";
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

const ADMIN_ROW = {
  id: ADMIN_ID,
  email: "reviewer@kidlearn.test",
  name: "Reviewer One",
  role: "admin",
  authUserId: ADMIN_USER_ID,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

/** Ids are uuids because every params and body schema demands one. */
const WORLD_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const SUBJECT_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const TOPIC_ID = "cccccccc-0000-4000-8000-000000000001";
const LESSON_ID = "dddddddd-0000-4000-8000-000000000001";

type Row = Record<string, unknown> & { id: string };

const store = vi.hoisted(() => ({
  admins: [] as Array<Record<string, unknown> & { authUserId: string | null }>,
  worlds: [] as Row[],
  subjects: [] as Row[],
  topics: [] as Row[],
  lessons: [] as Row[],
  // File 36 — character sheets, and the two tables the "save as character sheet"
  // action reads a generation out of.
  characterSheets: [] as Row[],
  /**
   * Makes the next *n* slug lookups miss a row that is really there, which is the
   * only way to reach the check-then-act window from outside: the service looks a
   * slug up and then writes it, and a race is the check passing before the write
   * hits the unique index.
   */
  slugCheckMisses: 0,
  stories: [] as Row[],
  jobs: [] as Row[],
  /** Isolation levels `$transaction` was called with, for bound 4 above. */
  isolationLevels: [] as Array<string | undefined>,
}));

const db = vi.hoisted(() => ({ adminFindUnique: vi.fn() }));

vi.mock("../../lib/prisma.js", async () => {
  const { Prisma: PrismaNamespace } = await import("@kidlearn/db");

  /** A minimal Prisma model, backed by one array. */
  function table(rows: () => Row[], slugScope: string[]) {
    const matches = (row: Row, where: Record<string, unknown> = {}): boolean =>
      Object.entries(where).every(([column, condition]) => {
        if (
          condition !== null &&
          typeof condition === "object" &&
          "not" in condition
        ) {
          return row[column] !== (condition as { not: unknown }).not;
        }
        return row[column] === condition;
      });

    const sort = (list: Row[], orderBy: unknown): Row[] => {
      if (!orderBy) return [...list];
      const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
      return [...list].sort((left, right) => {
        for (const clause of clauses) {
          const entry = Object.entries(clause as Record<string, string>)[0];
          if (!entry) continue;
          const [column, direction] = entry;
          const a = left[column];
          const b = right[column];
          if (a === b) continue;
          const smaller =
            typeof a === "number" && typeof b === "number"
              ? a < b
              : String(a) < String(b);
          return (smaller ? -1 : 1) * (direction === "desc" ? -1 : 1);
        }
        return 0;
      });
    };

    /** Applies a nested `translations: { create | upsert }` write in place. */
    const writeTranslations = (row: Row, nested: unknown): void => {
      if (!nested || typeof nested !== "object") return;
      const existing = (row.translations ?? []) as Array<
        Record<string, unknown>
      >;
      const { create, upsert } = nested as {
        create?: Array<Record<string, unknown>>;
        upsert?: Array<{
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }>;
      };

      if (create) existing.push(...create);

      for (const one of upsert ?? []) {
        const found = existing.find((t) => t.language === one.create.language);
        if (found) Object.assign(found, one.update);
        else existing.push({ ...one.create });
      }
      row.translations = existing;
    };

    return {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows().find((row) => row.id === where.id) ?? null,

      findMany: async ({
        where,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        orderBy?: unknown;
      }) =>
        sort(
          rows().filter((row) => matches(row, where)),
          orderBy,
        ),

      aggregate: async ({ where }: { where?: Record<string, unknown> }) => {
        const scoped = rows().filter((row) => matches(row, where));
        const highest = scoped.reduce<number | null>((max, row) => {
          const value = row.sortOrder as number;
          return max === null || value > max ? value : max;
        }, null);
        return { _max: { sortOrder: highest } };
      },

      create: async ({ data }: { data: Record<string, unknown> }) => {
        const { translations, ...scalars } = data;
        const collides = rows().some((row) =>
          slugScope.every((column) => row[column] === scalars[column]),
        );
        if (collides) {
          throw new PrismaNamespace.PrismaClientKnownRequestError(
            "Unique constraint failed",
            { code: "P2002", clientVersion: "test" },
          );
        }

        const row: Row = {
          id: (scalars.id as string) ?? `generated-${rows().length}`,
          status: "draft",
          sortOrder: 0,
          gradeLevels: [],
          conceptsIntroduced: [],
          createdAt: new Date("2026-08-23T00:00:00.000Z"),
          updatedAt: new Date("2026-08-23T00:00:00.000Z"),
          updatedBy: null,
          translations: [],
          ...scalars,
        };
        writeTranslations(row, translations);
        rows().push(row);
        return row;
      },

      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = rows().find((one) => one.id === where.id);
        if (!row) throw new Error(`no row ${where.id}`);
        const { translations, ...scalars } = data;
        Object.assign(row, scalars, {
          updatedAt: new Date("2026-08-24T00:00:00.000Z"),
        });
        writeTranslations(row, translations);
        return row;
      },
    };
  }

  const client = {
    $transaction: async (
      fn: unknown,
      options?: { isolationLevel?: string },
    ) => {
      store.isolationLevels.push(options?.isolationLevel);
      return typeof fn === "function" ? fn(client) : undefined;
    },
    adminUser: { findUnique: db.adminFindUnique },
    world: table(() => store.worlds, ["slug"]),
    subject: table(() => store.subjects, ["slug"]),
    topic: table(() => store.topics, ["subjectId", "slug"]),
    lesson: table(() => store.lessons, ["topicId", "slug"]),
    /**
     * Character sheets (file 36). Its own stub rather than `table()`, because the
     * service looks a sheet up **by slug** — that read is how an import
     * recognises a character it has already saved, so a stub that only answered
     * on `id` would make every skip test pass for the wrong reason.
     */
    characterSheet: {
      findUnique: async ({
        where,
      }: {
        where: { id?: string; slug?: string };
      }) =>
        store.characterSheets.find((row) => {
          if (where.slug === undefined) return row.id === where.id;
          if (row.slug !== where.slug) return false;
          if (store.slugCheckMisses > 0) {
            store.slugCheckMisses -= 1;
            return false;
          }
          return true;
        }) ?? null,

      findMany: async ({
        where,
      }: {
        where: { OR?: Array<{ worldId: string | null }> };
      }) => {
        const wanted = where.OR?.map((clause) => clause.worldId);
        return store.characterSheets
          .filter(
            (row) => !wanted || wanted.includes(row.worldId as string | null),
          )
          .sort((left, right) =>
            String(left.slug).localeCompare(String(right.slug)),
          );
      },

      create: async ({ data }: { data: Record<string, unknown> }) => {
        // `CharacterSheet_slug_key` enforced here, because the service's
        // `findUnique`-then-`create` is check-then-act: the only way a test can
        // reach the code that handles a lost race is for the stub to raise the
        // same P2002 the index would.
        if (store.characterSheets.some((row) => row.slug === data.slug)) {
          throw new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed on the fields: (`slug`)",
            { code: "P2002", clientVersion: "test" },
          );
        }

        const row: Row = {
          id: `sheet-${store.characterSheets.length + 1}`,
          worldId: null,
          createdAt: new Date("2026-09-03T00:00:00.000Z"),
          updatedAt: new Date("2026-09-03T00:00:00.000Z"),
          ...data,
        };
        store.characterSheets.push(row);
        return row;
      },

      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = store.characterSheets.find((one) => one.id === where.id);
        if (!row) throw new Error(`no sheet ${where.id}`);
        Object.assign(row, data, {
          updatedAt: new Date("2026-09-04T00:00:00.000Z"),
        });
        return row;
      },
    },
    story: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.stories.find((row) => row.id === where.id) ?? null,
    },
    aIGenerationJob: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.jobs.find((row) => row.id === where.id) ?? null,
      // `assertAiPublishable` reads every job a row answers for in one query.
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        store.jobs.filter((row) => where.id.in.includes(row.id)),
      updateMany: async () => ({ count: 0 }),
    },
    // Present so a stray parent-provisioning read fails loudly: no admin route
    // may create a Parent row.
    parent: { findUnique: vi.fn(), upsert: vi.fn() },
    account: { findFirst: vi.fn() },
  };

  return { prisma: client };
});

const { app } = await import("../../app.js");
const { auth } = await import("../../lib/auth.js");

function mockSession(userId: string) {
  // Only the fields the guards read are supplied, so the deep better-auth return
  // type is narrowed at this boundary.
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: { id: userId, email: "someone@example.com", name: "Someone" },
    session: { id: `session_${userId}`, userId },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>);
}

const localizedName = (name: string) => ({ en: name, bn: `${name} (bn)` });

const lessonTranslations = (title: string) => ({
  en: { title, introScript: `Let us learn ${title}.` },
  bn: { title: `${title} (bn)`, introScript: `${title} শিখি।` },
});

/** Seeds a row directly, bypassing the API — a fixture, not an assertion. */
function seed(table: Row[], row: Partial<Row> & { id: string }): Row {
  const full: Row = {
    status: "draft",
    sortOrder: 0,
    gradeLevels: ["KG1"],
    conceptsIntroduced: [],
    palette: {},
    mascotAssetId: null,
    activityId: null,
    quizId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedBy: null,
    translations: [
      {
        language: "en",
        name: "Seeded",
        title: "Seeded",
        introScript: "Hi",
        videoAssetId: null,
      },
      {
        language: "bn",
        name: "Seeded (bn)",
        title: "Seeded (bn)",
        introScript: "হাই",
        videoAssetId: null,
      },
    ],
    ...row,
  };
  table.push(full);
  return full;
}

beforeEach(() => {
  store.admins = [ADMIN_ROW];
  store.worlds = [];
  store.subjects = [];
  store.topics = [];
  store.lessons = [];
  store.characterSheets = [];
  store.slugCheckMisses = 0;
  store.stories = [];
  store.jobs = [];
  store.isolationLevels = [];
  db.adminFindUnique.mockReset();
  db.adminFindUnique.mockImplementation(
    async ({ where }: { where: { authUserId?: string } }) =>
      store.admins.find((row) => row.authUserId === where.authUserId) ?? null,
  );
  mockSession(ADMIN_USER_ID);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the admin guard covers every content path", () => {
  const PROBES = [
    { method: "get" as const, path: `${BASE}/subjects` },
    { method: "post" as const, path: `${BASE}/subjects` },
    { method: "get" as const, path: `${BASE}/lessons/${LESSON_ID}` },
    { method: "patch" as const, path: `${BASE}/lessons/${LESSON_ID}` },
    {
      method: "post" as const,
      path: `${BASE}/lessons/${LESSON_ID}/transition`,
    },
    { method: "patch" as const, path: `${BASE}/topics/reorder` },
  ];

  it.each(PROBES)("401 unauthenticated: $method $path", async ({
    method,
    path,
  }) => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it.each(PROBES)("403 for a signed-in parent: $method $path", async ({
    method,
    path,
  }) => {
    // A Google sign-in never writes an AdminUser row, and that absence *is* the
    // authorisation check (spec §4.3). The guard sits on the router, so the
    // handler never runs.
    mockSession(PARENT_USER_ID);

    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(store.subjects).toEqual([]);
  });
});

describe("POST /api/admin/content/subjects", () => {
  const OPERATION = "POST /api/admin/content/subjects";

  const body = {
    slug: "letters",
    name: "Letters",
    gradeLevels: ["NURSERY", "KG1"],
    translations: localizedName("Letters"),
  };

  it("creates the subject as a draft, whatever the caller wants", async () => {
    const res = await request(app).post(`${BASE}/subjects`).send(body);

    expect(res.status).toBe(201);
    assertContract(AdminSubjectResponseSchema, res.body, OPERATION);
    expect(res.body.data).toMatchObject({
      slug: "letters",
      name: "Letters",
      status: "draft",
      gradeLevels: ["NURSERY", "KG1"],
      translations: { en: "Letters", bn: "Letters (bn)" },
    });
    expect(store.subjects).toHaveLength(1);
  });

  it("stamps the acting admin's id on the row", async () => {
    await request(app).post(`${BASE}/subjects`).send(body);

    expect(store.subjects[0].updatedBy).toBe(ADMIN_ID);
  });

  it("rejects a body that omits a locale", async () => {
    const res = await request(app)
      .post(`${BASE}/subjects`)
      .send({ ...body, translations: { en: "Letters" } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    // Nothing reached the store: validation runs at the route boundary.
    expect(store.subjects).toEqual([]);
  });

  it("rejects a status supplied at creation time", async () => {
    const res = await request(app)
      .post(`${BASE}/subjects`)
      .send({ ...body, status: "published" });

    expect(res.status).toBe(400);
    expect(store.subjects).toEqual([]);
  });

  it("rejects a slug that is not url-safe", async () => {
    const res = await request(app)
      .post(`${BASE}/subjects`)
      .send({ ...body, slug: "Letters and Numbers!" });

    expect(res.status).toBe(400);
  });

  it("appends: each new sibling takes the next sortOrder", async () => {
    await request(app).post(`${BASE}/subjects`).send(body);
    await request(app)
      .post(`${BASE}/subjects`)
      .send({ ...body, slug: "numbers", name: "Numbers" });

    expect(store.subjects.map((row) => row.sortOrder)).toEqual([0, 1]);
  });

  it("answers 409 DUPLICATE_SLUG rather than 500 on a taken slug", async () => {
    await request(app).post(`${BASE}/subjects`).send(body);

    const res = await request(app).post(`${BASE}/subjects`).send(body);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.details).toMatchObject({ code: "DUPLICATE_SLUG" });
  });
});

describe("POST /api/admin/content/lessons", () => {
  const OPERATION = "POST /api/admin/content/lessons";

  const body = {
    topicId: TOPIC_ID,
    worldId: WORLD_ID,
    slug: "letter-a",
    title: "Letter A",
    gradeLevels: ["KG1"],
    conceptsIntroduced: ["letter:A"],
    translations: lessonTranslations("Letter A"),
  };

  beforeEach(() => {
    seed(store.worlds, {
      id: WORLD_ID,
      slug: "forest",
      name: "Forest",
      palette: {},
    });
    seed(store.subjects, { id: SUBJECT_ID, slug: "letters", name: "Letters" });
    seed(store.topics, {
      id: TOPIC_ID,
      subjectId: SUBJECT_ID,
      slug: "vowels",
      name: "Vowels",
    });
  });

  it("creates a draft lesson with both locales", async () => {
    const res = await request(app).post(`${BASE}/lessons`).send(body);

    expect(res.status).toBe(201);
    assertContract(AdminLessonResponseSchema, res.body, OPERATION);
    expect(res.body.data).toMatchObject({
      status: "draft",
      title: "Letter A",
      conceptsIntroduced: ["letter:A"],
      activityId: null,
      quizId: null,
      translations: {
        en: { title: "Letter A", videoAssetId: null },
        bn: { title: "Letter A (bn)" },
      },
    });
  });

  it("answers 404 for a topic that does not exist, not a 500", async () => {
    const res = await request(app)
      .post(`${BASE}/lessons`)
      .send({ ...body, topicId: "eeeeeeee-0000-4000-8000-000000000009" });

    // Without the explicit check this would surface as Prisma's foreign-key
    // violation, which the error handler can only report as a 500.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects a concept token with no recognised prefix", async () => {
    const res = await request(app)
      .post(`${BASE}/lessons`)
      .send({ ...body, conceptsIntroduced: ["A"] });

    // An unprefixed token matches nothing in the weekly report and produces no
    // error anyone would ever see (file 30).
    expect(res.status).toBe(400);
  });
});

describe("PATCH cannot change status", () => {
  beforeEach(() => {
    seed(store.lessons, {
      id: LESSON_ID,
      topicId: TOPIC_ID,
      worldId: WORLD_ID,
      slug: "letter-a",
      title: "Letter A",
      status: "draft",
    });
  });

  it("returns 400 for a body carrying status, and leaves the row alone", async () => {
    const res = await request(app)
      .patch(`${BASE}/lessons/${LESSON_ID}`)
      .send({ status: "published" });

    // The whole publishing workflow rests on this: if an edit could set status,
    // unreviewed content would be one request away from a five-year-old.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(store.lessons[0].status).toBe("draft");
  });

  it("returns 400 for status smuggled alongside a legitimate field", async () => {
    const res = await request(app)
      .patch(`${BASE}/lessons/${LESSON_ID}`)
      .send({ title: "Letter A revised", status: "published" });

    expect(res.status).toBe(400);
    expect(store.lessons[0]).toMatchObject({
      title: "Letter A",
      status: "draft",
    });
  });

  it("rejects sortOrder too — ordering belongs to the reorder endpoint", async () => {
    const res = await request(app)
      .patch(`${BASE}/lessons/${LESSON_ID}`)
      .send({ sortOrder: 3 });

    expect(res.status).toBe(400);
  });

  it("rejects an empty body rather than stamping an edit that changed nothing", async () => {
    const res = await request(app)
      .patch(`${BASE}/lessons/${LESSON_ID}`)
      .send({});

    expect(res.status).toBe(400);
    expect(store.lessons[0].updatedBy).toBeNull();
  });
});

describe("a published row refuses an edit", () => {
  /**
   * The gap this closes: the transition matrix guards the *act* of publishing,
   * and an edit does not move the status, so nothing in the matrix ever sees a
   * `PATCH` on a live row. Without the guard, rewriting a published lesson's
   * title and intro script puts words in front of a five-year-old that no
   * reviewer approved — and it is the path file 37's AI-generated edits would
   * take.
   */
  beforeEach(() => {
    seed(store.subjects, { id: SUBJECT_ID, slug: "letters", name: "Letters" });
    seed(store.topics, {
      id: TOPIC_ID,
      subjectId: SUBJECT_ID,
      slug: "vowels",
      name: "Vowels",
    });
  });

  function seedLesson(status: string) {
    store.lessons = [];
    seed(store.lessons, {
      id: LESSON_ID,
      topicId: TOPIC_ID,
      worldId: WORLD_ID,
      slug: "letter-a",
      title: "Letter A",
      status,
    });
  }

  it("returns 409 EDIT_REQUIRES_UNPUBLISH and leaves the content untouched", async () => {
    seedLesson("published");

    const res = await request(app)
      .patch(`${BASE}/lessons/${LESSON_ID}`)
      .send({
        title: "Letter A, rewritten",
        translations: lessonTranslations("Letter A, rewritten"),
      });

    expect(res.status).toBe(409);
    expect(res.body.error.details).toMatchObject({
      code: "EDIT_REQUIRES_UNPUBLISH",
      status: "published",
      allowed: ["draft", "archived"],
    });

    // The refusal has to be a refusal, not a partial write: the row keeps both
    // its title and its audit stamp.
    expect(store.lessons[0]).toMatchObject({
      title: "Letter A",
      status: "published",
      updatedBy: null,
    });
  });

  it("refuses on every resource, not only lessons", async () => {
    store.worlds = [];
    seed(store.worlds, {
      id: WORLD_ID,
      slug: "space",
      name: "Space",
      status: "published",
    });
    store.subjects[0].status = "published";
    store.topics[0].status = "published";
    seedLesson("published");

    const attempts = [
      request(app)
        .patch(`${BASE}/worlds/${WORLD_ID}`)
        .send({ name: "Deep space" }),
      request(app)
        .patch(`${BASE}/subjects/${SUBJECT_ID}`)
        .send({ name: "Reading" }),
      request(app)
        .patch(`${BASE}/topics/${TOPIC_ID}`)
        .send({ name: "Long vowels" }),
      request(app)
        .patch(`${BASE}/lessons/${LESSON_ID}`)
        .send({ title: "Letter B" }),
    ];

    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(409);
      expect(res.body.error.details.code).toBe("EDIT_REQUIRES_UNPUBLISH");
    }
  });

  it.each([
    "draft",
    "in_review",
    "approved",
    "rejected",
    "archived",
  ])("allows the edit at %s", async (status) => {
    seedLesson(status);

    const res = await request(app)
      .patch(`${BASE}/lessons/${LESSON_ID}`)
      .send({ title: "Letter A revised" });

    expect(res.status).toBe(200);
    expect(store.lessons[0].title).toBe("Letter A revised");
  });

  it("lets the edit through once the row is withdrawn to draft", async () => {
    // The documented way out, end to end: withdraw, edit, and the content is
    // back in the review queue rather than live.
    seedLesson("published");

    const withdrawn = await request(app)
      .post(`${BASE}/lessons/${LESSON_ID}/transition`)
      .send({ to: "draft" });
    expect(withdrawn.status).toBe(200);

    const edited = await request(app)
      .patch(`${BASE}/lessons/${LESSON_ID}`)
      .send({ title: "Letter A, rewritten" });

    expect(edited.status).toBe(200);
    expect(store.lessons[0]).toMatchObject({
      title: "Letter A, rewritten",
      status: "draft",
    });
  });

  it("checks the status the row actually holds, inside a Serializable transaction", async () => {
    // Bound 4 of the stub exception again: a stub cannot race an edit against a
    // publish, so what is asserted is the isolation level that makes the read
    // and the write indivisible. A `published` check made before the transaction
    // could be stale by the time the edit lands.
    seedLesson("draft");
    store.isolationLevels = [];

    await request(app)
      .patch(`${BASE}/lessons/${LESSON_ID}`)
      .send({ title: "Letter A revised" });

    expect(store.isolationLevels).toContain(
      Prisma.TransactionIsolationLevel.Serializable,
    );
  });

  it("still returns 404 for an id that does not exist", async () => {
    // The guard reads the status to apply itself, and that read is now the
    // source of the 404 — it must not turn a missing row into a 409.
    const res = await request(app)
      .patch(`${BASE}/lessons/ffffffff-0000-4000-8000-000000000009`)
      .send({ title: "Nothing" });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/admin/content/topics/:id", () => {
  const OPERATION = "PATCH /api/admin/content/topics/{id}";

  beforeEach(() => {
    seed(store.subjects, { id: SUBJECT_ID, slug: "letters", name: "Letters" });
    seed(store.topics, {
      id: TOPIC_ID,
      subjectId: SUBJECT_ID,
      slug: "vowels",
      name: "Vowels",
    });
  });

  it("applies a partial edit and re-stamps updatedBy", async () => {
    const res = await request(app)
      .patch(`${BASE}/topics/${TOPIC_ID}`)
      .send({
        name: "Vowel sounds",
        translations: localizedName("Vowel sounds"),
      });

    expect(res.status).toBe(200);
    assertContract(AdminTopicResponseSchema, res.body, OPERATION);
    expect(res.body.data).toMatchObject({
      name: "Vowel sounds",
      slug: "vowels",
      translations: { en: "Vowel sounds", bn: "Vowel sounds (bn)" },
    });
    expect(store.topics[0].updatedBy).toBe(ADMIN_ID);
  });

  it("refuses to move a topic between subjects", async () => {
    // Not an oversight: re-parenting is a reordering event on two sibling sets,
    // and it is out of this file's scope. `.strict()` is what says so.
    const res = await request(app)
      .patch(`${BASE}/topics/${TOPIC_ID}`)
      .send({ subjectId: "ffffffff-0000-4000-8000-000000000001" });

    expect(res.status).toBe(400);
  });

  it("returns 404 for an id that does not exist", async () => {
    const res = await request(app)
      .patch(`${BASE}/topics/ffffffff-0000-4000-8000-000000000009`)
      .send({ name: "Nothing" });

    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/content/:resource/:id/transition", () => {
  const OPERATION = "POST /api/admin/content/lessons/{id}/transition";
  const path = `${BASE}/lessons/${LESSON_ID}/transition`;

  function seedLesson(status: string) {
    store.lessons = [];
    seed(store.lessons, {
      id: LESSON_ID,
      topicId: TOPIC_ID,
      worldId: WORLD_ID,
      slug: "letter-a",
      title: "Letter A",
      status,
      gradeLevels: ["KG1"],
    });
  }

  it("publishes an approved lesson", async () => {
    seedLesson("approved");

    const res = await request(app).post(path).send({ to: "published" });

    expect(res.status).toBe(200);
    assertContract(AdminLessonResponseSchema, res.body, OPERATION);
    expect(res.body.data.status).toBe("published");
    expect(store.lessons[0]).toMatchObject({
      status: "published",
      updatedBy: ADMIN_ID,
    });
  });

  it("refuses rejected → published with 409 INVALID_TRANSITION", async () => {
    seedLesson("rejected");

    const res = await request(app).post(path).send({ to: "published" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.details).toMatchObject({
      code: "INVALID_TRANSITION",
      from: "rejected",
      to: "published",
      allowed: ["draft", "archived"],
    });
    expect(store.lessons[0].status).toBe("rejected");
  });

  it("takes rejected content four hops to reach published, all through review", async () => {
    seedLesson("rejected");

    for (const to of ["draft", "in_review", "approved", "published"]) {
      const res = await request(app).post(path).send({ to });
      expect(res.status, `hop to ${to}`).toBe(200);
    }

    expect(store.lessons[0].status).toBe("published");
  });

  it("refuses draft → published, so nothing skips a reviewer", async () => {
    seedLesson("draft");

    const res = await request(app).post(path).send({ to: "published" });

    expect(res.status).toBe(409);
    expect(store.lessons[0].status).toBe("draft");
  });

  /**
   * The FR-AI-07 invariant, reached through the *generic* endpoint (file 37).
   */
  describe("AI-generated content cannot be published without a review decision", () => {
    function seedAiLesson(job: {
      status: string;
      decision: string | null;
    }): void {
      seedLesson("draft");
      store.lessons[0].aiJobId = "job-1";
      store.jobs = [{ id: "job-1", ...job }];
    }

    it("409s AI_REVIEW_REQUIRED on the publish hop of an undecided draft", async () => {
      seedAiLesson({ status: "awaiting_review", decision: null });

      for (const to of ["in_review", "approved"]) {
        const res = await request(app).post(path).send({ to });
        expect(res.status, `hop to ${to}`).toBe(200);
      }

      const res = await request(app).post(path).send({ to: "published" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(res.body.error.details).toMatchObject({
        code: "AI_REVIEW_REQUIRED",
        jobId: "job-1",
        jobStatus: "awaiting_review",
        decision: null,
      });
      // Still `approved`, which is not `published` — and `published` is the one
      // value every student query filters on (asserted against the exported
      // filter in "publishing is immediate visibility" below).
      expect(store.lessons[0].status).toBe("approved");
    });

    it("409s even when an editor recorded edit_then_approve but nobody approved", async () => {
      // The decision alone is not the gate. The editors write it the moment a
      // reviewer saves, which is before any approval — so a decision-only check
      // would leave exactly this door open.
      seedAiLesson({
        status: "awaiting_review",
        decision: "edit_then_approve",
      });
      store.lessons[0].status = "approved";

      const res = await request(app).post(path).send({ to: "published" });

      expect(res.status).toBe(409);
      expect(res.body.error.details).toMatchObject({
        code: "AI_REVIEW_REQUIRED",
      });
    });

    it("409s a rejected job's content, so a rejection cannot be walked around", async () => {
      seedAiLesson({ status: "rejected", decision: "reject" });
      store.lessons[0].status = "approved";

      const res = await request(app).post(path).send({ to: "published" });

      expect(res.status).toBe(409);
      expect(store.lessons[0].status).toBe("approved");
    });

    it("publishes once the job carries an approved decision", async () => {
      seedAiLesson({ status: "approved", decision: "approve" });
      store.lessons[0].status = "approved";

      const res = await request(app).post(path).send({ to: "published" });

      expect(res.status).toBe(200);
      assertContract(AdminLessonResponseSchema, res.body, OPERATION);
      expect(store.lessons[0].status).toBe("published");
    });

    it("leaves human-authored content alone", async () => {
      // A null `aiJobId` short-circuits before any job read, which is the normal
      // case and must stay free.
      seedLesson("approved");
      store.jobs = [];

      const res = await request(app).post(path).send({ to: "published" });

      expect(res.status).toBe(200);
      expect(store.lessons[0].status).toBe("published");
    });
  });

  it("returns 400 for a status that is not a status at all", async () => {
    seedLesson("draft");

    const res = await request(app).post(path).send({ to: "live" });

    // `400`, not `409`: the body is malformed rather than the state being wrong.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 404 for a row that does not exist", async () => {
    const res = await request(app)
      .post(`${BASE}/lessons/ffffffff-0000-4000-8000-000000000009/transition`)
      .send({ to: "in_review" });

    expect(res.status).toBe(404);
  });

  it("reads and writes the status inside one Serializable transaction", async () => {
    seedLesson("in_review");

    await request(app).post(path).send({ to: "approved" });

    // Bound 4 of the stub exception: a stub cannot race two approvals, so what is
    // asserted is the isolation level the race safety rests on. READ COMMITTED
    // would let two admins both read `in_review` and both succeed.
    expect(store.isolationLevels).toEqual([
      Prisma.TransactionIsolationLevel.Serializable,
    ]);
  });

  it("works the same on every resource, not just lessons", async () => {
    seed(store.subjects, {
      id: SUBJECT_ID,
      slug: "letters",
      name: "Letters",
      status: "draft",
    });

    const res = await request(app)
      .post(`${BASE}/subjects/${SUBJECT_ID}/transition`)
      .send({ to: "in_review" });

    expect(res.status).toBe(200);
    assertContract(
      AdminSubjectResponseSchema,
      res.body,
      "POST /api/admin/content/subjects/{id}/transition",
    );
    expect(store.subjects[0].status).toBe("in_review");
  });
});

describe("publishing is immediate visibility (FR-CMS-06)", () => {
  /**
   * The child every student query is filtered for. Only the two fields
   * `publishedForChild` reads are supplied.
   */
  const CHILD = { gradeLevel: "KG1" } as unknown as Parameters<
    typeof publishedForChild
  >[0];

  /** Applies the exported student filter to a stored row, as Prisma would. */
  function isVisibleToChild(row: Row): boolean {
    const where = publishedForChild(CHILD);
    const grades = row.gradeLevels as string[];
    return (
      row.status === where.status && grades.includes(where.gradeLevels.has)
    );
  }

  beforeEach(() => {
    seed(store.lessons, {
      id: LESSON_ID,
      topicId: TOPIC_ID,
      worldId: WORLD_ID,
      slug: "letter-a",
      title: "Letter A",
      status: "approved",
      gradeLevels: ["KG1"],
    });
  });

  it("makes an approved lesson visible the moment it is published", async () => {
    expect(isVisibleToChild(store.lessons[0])).toBe(false);

    await request(app)
      .post(`${BASE}/lessons/${LESSON_ID}/transition`)
      .send({ to: "published" });

    // Bound 2 of the stub exception. No test database exists to run the student
    // endpoint against, so this applies `publishedForChild` — the one filter every
    // query in file 12 composes — to the row this API just wrote. There is no
    // second flag and no cache between the two: satisfying that filter *is* being
    // visible.
    expect(isVisibleToChild(store.lessons[0])).toBe(true);
  });

  it("withdraws it just as immediately on unpublish, without deleting it", async () => {
    await request(app)
      .post(`${BASE}/lessons/${LESSON_ID}/transition`)
      .send({ to: "published" });
    await request(app)
      .post(`${BASE}/lessons/${LESSON_ID}/transition`)
      .send({ to: "draft" });

    expect(isVisibleToChild(store.lessons[0])).toBe(false);
    // The row survives, and so does anything referencing it — unpublishing is not
    // deletion.
    expect(store.lessons).toHaveLength(1);
  });

  it("archiving also removes it from students", async () => {
    await request(app)
      .post(`${BASE}/lessons/${LESSON_ID}/transition`)
      .send({ to: "published" });
    await request(app)
      .post(`${BASE}/lessons/${LESSON_ID}/transition`)
      .send({ to: "archived" });

    expect(isVisibleToChild(store.lessons[0])).toBe(false);
  });
});

describe("PATCH /api/admin/content/:resource/reorder", () => {
  const OPERATION = "PATCH /api/admin/content/topics/reorder";
  const TOPIC_IDS = [
    "cccccccc-0000-4000-8000-00000000000a",
    "cccccccc-0000-4000-8000-00000000000b",
    "cccccccc-0000-4000-8000-00000000000c",
  ];

  beforeEach(() => {
    seed(store.subjects, { id: SUBJECT_ID, slug: "letters", name: "Letters" });
    for (const [index, id] of TOPIC_IDS.entries()) {
      seed(store.topics, {
        id,
        subjectId: SUBJECT_ID,
        slug: `topic-${index}`,
        name: `Topic ${index}`,
        sortOrder: index,
      });
    }
  });

  const orderOf = (id: string) =>
    store.topics.find((row) => row.id === id)?.sortOrder;

  it("persists 0, 1, 2 in the order supplied", async () => {
    const reversed = [...TOPIC_IDS].reverse();

    const res = await request(app)
      .patch(`${BASE}/topics/reorder`)
      .send({ parentId: SUBJECT_ID, orderedIds: reversed });

    expect(res.status).toBe(200);
    assertContract(ReorderedIdsResponseSchema, res.body, OPERATION);
    expect(res.body.data.orderedIds).toEqual(reversed);
    expect(reversed.map(orderOf)).toEqual([0, 1, 2]);
  });

  it("is what the subsequent list reads back", async () => {
    const reversed = [...TOPIC_IDS].reverse();
    await request(app)
      .patch(`${BASE}/topics/reorder`)
      .send({ parentId: SUBJECT_ID, orderedIds: reversed });

    const res = await request(app).get(
      `${BASE}/topics?subjectId=${SUBJECT_ID}`,
    );

    assertContract(
      AdminTopicListResponseSchema,
      res.body,
      "GET /api/admin/content/topics",
    );
    expect(res.body.data.map((row: { id: string }) => row.id)).toEqual(
      reversed,
    );
  });

  /** The sibling set is whichever list the admin was looking at. */
  describe("and the archived siblings", () => {
    const ARCHIVED_ID = "cccccccc-0000-4000-8000-00000000000d";

    beforeEach(() => {
      seed(store.topics, {
        id: ARCHIVED_ID,
        subjectId: SUBJECT_ID,
        slug: "topic-retired",
        name: "Retired",
        status: "archived",
        sortOrder: 3,
      });
    });

    it("orders them too when the caller says it can see them", async () => {
      const withArchived = [ARCHIVED_ID, ...TOPIC_IDS];

      const res = await request(app).patch(`${BASE}/topics/reorder`).send({
        parentId: SUBJECT_ID,
        orderedIds: withArchived,
        includeArchived: true,
      });

      expect(res.status).toBe(200);
      assertContract(ReorderedIdsResponseSchema, res.body, OPERATION);
      expect(withArchived.map(orderOf)).toEqual([0, 1, 2, 3]);
    });

    it("leaves them out, and untouched, on the default view", async () => {
      const reversed = [...TOPIC_IDS].reverse();

      const res = await request(app)
        .patch(`${BASE}/topics/reorder`)
        .send({ parentId: SUBJECT_ID, orderedIds: reversed });

      expect(res.status).toBe(200);
      expect(reversed.map(orderOf)).toEqual([0, 1, 2]);
      expect(orderOf(ARCHIVED_ID)).toBe(3);
    });

    it("refuses a payload that claims the wrong set", async () => {
      const res = await request(app)
        .patch(`${BASE}/topics/reorder`)
        .send({
          parentId: SUBJECT_ID,
          orderedIds: [ARCHIVED_ID, ...TOPIC_IDS],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.details.unknown).toEqual([ARCHIVED_ID]);
    });

    it("refuses a set that omits one it was told to expect", async () => {
      const res = await request(app).patch(`${BASE}/topics/reorder`).send({
        parentId: SUBJECT_ID,
        orderedIds: TOPIC_IDS,
        includeArchived: true,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.details.missing).toEqual([ARCHIVED_ID]);
    });
  });

  it("stamps the acting admin on every row it moved", async () => {
    await request(app)
      .patch(`${BASE}/topics/reorder`)
      .send({ parentId: SUBJECT_ID, orderedIds: [...TOPIC_IDS].reverse() });

    expect(store.topics.map((row) => row.updatedBy)).toEqual([
      ADMIN_ID,
      ADMIN_ID,
      ADMIN_ID,
    ]);
  });

  it("rejects a payload missing a sibling, and names it", async () => {
    const res = await request(app)
      .patch(`${BASE}/topics/reorder`)
      .send({ parentId: SUBJECT_ID, orderedIds: TOPIC_IDS.slice(0, 2) });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toMatchObject({
      missing: [TOPIC_IDS[2]],
      unknown: [],
      hasDuplicates: false,
    });
    // Refused whole: a partial order is worse than none.
    expect(TOPIC_IDS.map(orderOf)).toEqual([0, 1, 2]);
  });

  it("rejects an id from another parent", async () => {
    const stranger = "cccccccc-0000-4000-8000-0000000000ff";
    seed(store.topics, {
      id: stranger,
      subjectId: "ffffffff-0000-4000-8000-000000000001",
      slug: "elsewhere",
      name: "Elsewhere",
    });

    const res = await request(app)
      .patch(`${BASE}/topics/reorder`)
      .send({ parentId: SUBJECT_ID, orderedIds: [...TOPIC_IDS, stranger] });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toMatchObject({ unknown: [stranger] });
  });

  it("rejects a duplicated id", async () => {
    const res = await request(app)
      .patch(`${BASE}/topics/reorder`)
      .send({
        parentId: SUBJECT_ID,
        orderedIds: [TOPIC_IDS[0], TOPIC_IDS[0], TOPIC_IDS[1]],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toMatchObject({ hasDuplicates: true });
  });

  it("requires parentId for topics, which always have one", async () => {
    const res = await request(app)
      .patch(`${BASE}/topics/reorder`)
      .send({ orderedIds: TOPIC_IDS });

    expect(res.status).toBe(400);
  });

  it("takes no parentId for subjects, which have none", async () => {
    const subjectIds = ["bbbbbbbb-0000-4000-8000-00000000000a", SUBJECT_ID];
    seed(store.subjects, {
      id: subjectIds[0],
      slug: "numbers",
      name: "Numbers",
      sortOrder: 1,
    });

    const res = await request(app)
      .patch(`${BASE}/subjects/reorder`)
      .send({ orderedIds: subjectIds });

    expect(res.status).toBe(200);
    expect(
      subjectIds.map(
        (id) => store.subjects.find((r) => r.id === id)?.sortOrder,
      ),
    ).toEqual([0, 1]);
  });

  it("writes the whole set inside one Serializable transaction", async () => {
    await request(app)
      .patch(`${BASE}/topics/reorder`)
      .send({ parentId: SUBJECT_ID, orderedIds: TOPIC_IDS });

    // One transaction, not three writes: a partially applied reorder leaves rows
    // sharing an index.
    expect(store.isolationLevels).toEqual([
      Prisma.TransactionIsolationLevel.Serializable,
    ]);
  });

  it("has no endpoint for worlds, which carry no sortOrder", async () => {
    const res = await request(app)
      .patch(`${BASE}/worlds/reorder`)
      .send({ orderedIds: [WORLD_ID] });

    // Falls through to `/worlds/:id`, whose params schema rejects `reorder` as a
    // uuid. Asserted so nobody reads the absence as an oversight.
    expect(res.status).toBe(400);
  });
});

describe("archived rows are hidden by default", () => {
  beforeEach(() => {
    seed(store.subjects, {
      id: SUBJECT_ID,
      slug: "letters",
      name: "Letters",
      status: "draft",
    });
    seed(store.subjects, {
      id: "bbbbbbbb-0000-4000-8000-00000000000a",
      slug: "retired",
      name: "Retired",
      status: "archived",
      sortOrder: 1,
    });
  });

  it("omits them from the list", async () => {
    const res = await request(app).get(`${BASE}/subjects`);

    expect(res.status).toBe(200);
    assertContract(
      AdminSubjectListResponseSchema,
      res.body,
      "GET /api/admin/content/subjects",
    );
    expect(res.body.data.map((row: { slug: string }) => row.slug)).toEqual([
      "letters",
    ]);
  });

  it("includes them with ?includeArchived=true", async () => {
    const res = await request(app).get(`${BASE}/subjects?includeArchived=true`);

    expect(res.body.data.map((row: { slug: string }) => row.slug)).toEqual([
      "letters",
      "retired",
    ]);
  });

  it("still reads one directly by id — hidden from a list is not gone", async () => {
    const res = await request(app).get(
      `${BASE}/subjects/bbbbbbbb-0000-4000-8000-00000000000a`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("archived");
  });

  it("excludes them from a reorder's sibling set", async () => {
    // Otherwise every reorder performed from the default view would fail, because
    // the list the admin dragged never contained the archived row.
    const res = await request(app)
      .patch(`${BASE}/subjects/reorder`)
      .send({ orderedIds: [SUBJECT_ID] });

    expect(res.status).toBe(200);
  });

  it("rejects a query parameter the schema does not know", async () => {
    const res = await request(app).get(`${BASE}/subjects?limit=5`);

    expect(res.status).toBe(400);
  });
});

describe("lists show every status, unlike the student API", () => {
  it("returns drafts and published rows alike", async () => {
    for (const [index, status] of [
      "draft",
      "in_review",
      "published",
    ].entries()) {
      seed(store.worlds, {
        id: `aaaaaaaa-0000-4000-8000-00000000000${index}`,
        slug: `world-${index}`,
        name: `World ${index}`,
        palette: { primary: "#2E7D32" },
        mascotAssetId: null,
        status,
      });
    }

    const res = await request(app).get(`${BASE}/worlds`);

    expect(res.status).toBe(200);
    assertContract(
      AdminWorldListResponseSchema,
      res.body,
      "GET /api/admin/content/worlds",
    );
    // The safety property is not that this endpoint is careful — it is that the
    // *student* endpoint filters. This one exists to show drafts.
    expect(res.body.data.map((row: { status: string }) => row.status)).toEqual([
      "draft",
      "in_review",
      "published",
    ]);
  });

  it("filters lessons by topic", async () => {
    seed(store.lessons, {
      id: LESSON_ID,
      topicId: TOPIC_ID,
      worldId: WORLD_ID,
      slug: "a",
      title: "A",
    });
    seed(store.lessons, {
      id: "dddddddd-0000-4000-8000-00000000000b",
      topicId: "cccccccc-0000-4000-8000-0000000000ff",
      worldId: WORLD_ID,
      slug: "b",
      title: "B",
    });

    const res = await request(app).get(`${BASE}/lessons?topicId=${TOPIC_ID}`);

    assertContract(
      AdminLessonListResponseSchema,
      res.body,
      "GET /api/admin/content/lessons",
    );
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(LESSON_ID);
  });
});

/** The world item shape, which no other resource shares. */
describe("the world item contract", () => {
  const body = {
    slug: "forest",
    name: "Forest",
    palette: { primary: "#2E7D32" },
    translations: localizedName("Forest"),
  };

  it("holds on create", async () => {
    const res = await request(app).post(`${BASE}/worlds`).send(body);

    expect(res.status).toBe(201);
    assertContract(
      AdminWorldResponseSchema,
      res.body,
      "POST /api/admin/content/worlds",
    );
    expect(res.body.data).toMatchObject({
      slug: "forest",
      status: "draft",
      palette: { primary: "#2E7D32" },
      mascotAssetId: null,
    });
  });

  it("holds on read-one", async () => {
    seed(store.worlds, {
      id: WORLD_ID,
      slug: "forest",
      name: "Forest",
      palette: { primary: "#2E7D32" },
    });

    const res = await request(app).get(`${BASE}/worlds/${WORLD_ID}`);

    expect(res.status).toBe(200);
    assertContract(
      AdminWorldResponseSchema,
      res.body,
      "GET /api/admin/content/worlds/{id}",
    );
  });

  it("holds on edit", async () => {
    seed(store.worlds, {
      id: WORLD_ID,
      slug: "forest",
      name: "Forest",
      palette: {},
    });

    const res = await request(app)
      .patch(`${BASE}/worlds/${WORLD_ID}`)
      .send({ name: "Deep Forest" });

    expect(res.status).toBe(200);
    assertContract(
      AdminWorldResponseSchema,
      res.body,
      "PATCH /api/admin/content/worlds/{id}",
    );
    expect(res.body.data.name).toBe("Deep Forest");
  });

  it("holds on transition", async () => {
    seed(store.worlds, {
      id: WORLD_ID,
      slug: "forest",
      name: "Forest",
      palette: {},
      status: "draft",
    });

    const res = await request(app)
      .post(`${BASE}/worlds/${WORLD_ID}/transition`)
      .send({ to: "in_review" });

    expect(res.status).toBe(200);
    assertContract(
      AdminWorldResponseSchema,
      res.body,
      "POST /api/admin/content/worlds/{id}/transition",
    );
    expect(res.body.data.status).toBe("in_review");
  });
});

/**
 * `GET /{resource}/{id}` on the other three. Cheap to skip and easy to break:
 * the read-one handler shares no code path with the list, so a `select` that
 * leaked or dropped a field would show up here and nowhere else.
 */
describe("the read-one contract on every resource", () => {
  it("holds for a subject", async () => {
    seed(store.subjects, { id: SUBJECT_ID, slug: "letters", name: "Letters" });

    const res = await request(app).get(`${BASE}/subjects/${SUBJECT_ID}`);

    expect(res.status).toBe(200);
    assertContract(
      AdminSubjectResponseSchema,
      res.body,
      "GET /api/admin/content/subjects/{id}",
    );
  });

  it("holds for a topic", async () => {
    seed(store.subjects, { id: SUBJECT_ID, slug: "letters", name: "Letters" });
    seed(store.topics, {
      id: TOPIC_ID,
      subjectId: SUBJECT_ID,
      slug: "vowels",
      name: "Vowels",
    });

    const res = await request(app).get(`${BASE}/topics/${TOPIC_ID}`);

    expect(res.status).toBe(200);
    assertContract(
      AdminTopicResponseSchema,
      res.body,
      "GET /api/admin/content/topics/{id}",
    );
  });

  it("holds for a lesson", async () => {
    seed(store.worlds, {
      id: WORLD_ID,
      slug: "forest",
      name: "Forest",
      palette: {},
    });
    seed(store.lessons, {
      id: LESSON_ID,
      topicId: TOPIC_ID,
      worldId: WORLD_ID,
      slug: "letter-a",
      title: "Letter A",
    });

    const res = await request(app).get(`${BASE}/lessons/${LESSON_ID}`);

    expect(res.status).toBe(200);
    assertContract(
      AdminLessonResponseSchema,
      res.body,
      "GET /api/admin/content/lessons/{id}",
    );
  });
});

describe("what the stub cannot prove — asserted against schema.prisma", () => {
  const schema = readFileSync(
    new URL("../../../../../packages/db/prisma/schema.prisma", import.meta.url),
    "utf8",
  );

  it("declares the unique indexes the 409 DUPLICATE_SLUG path rests on", () => {
    // The stub raises `P2002` because it was told which columns collide. Postgres
    // raises it because of these declarations, so they are what the behaviour
    // actually depends on. A real test replaces this once the database harness
    // exists.
    expect(schema).toMatch(/model World \{[\s\S]*?slug\s+String\s+@unique/);
    expect(schema).toMatch(/model Subject \{[\s\S]*?slug\s+String\s+@unique/);
    expect(schema).toMatch(/@@unique\(\[subjectId, slug\]\)/);
    expect(schema).toMatch(/@@unique\(\[topicId, slug\]\)/);
  });

  it("declares the updatedBy column every write in this file stamps", () => {
    const auditedModels = schema.match(/updatedBy\s+String\?/g) ?? [];
    expect(auditedModels).toHaveLength(4);
  });
});

/** Character sheets (file 36, FR-AI-09). */
describe("POST /api/admin/content/character-sheets", () => {
  const SHEET_BASE = `${BASE}/character-sheets`;

  const RABBIT = {
    name: "Nibbles",
    worldId: WORLD_ID,
    description:
      "A small white rabbit with one grey ear, wearing a red scarf, knee-high to a child.",
  };

  beforeEach(() => {
    seed(store.worlds, { id: WORLD_ID, slug: "jungle", name: "Jungle" });
  });

  it("401s an unauthenticated create", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);

    const res = await request(app).post(SHEET_BASE).send(RABBIT);

    expect(res.status).toBe(401);
    expect(store.characterSheets).toHaveLength(0);
  });

  it("403s a signed-in parent", async () => {
    mockSession(PARENT_USER_ID);

    const res = await request(app).post(SHEET_BASE).send(RABBIT);

    expect(res.status).toBe(403);
    expect(store.characterSheets).toHaveLength(0);
  });

  it("201s with the stored sheet", async () => {
    const res = await request(app).post(SHEET_BASE).send(RABBIT);

    expect(res.status).toBe(201);
    assertContract(
      CharacterSheetResponseSchema,
      res.body,
      "POST /api/admin/content/character-sheets",
    );
    expect(res.body.data).toMatchObject({
      slug: "nibbles",
      name: "Nibbles",
      worldId: WORLD_ID,
      description: RABBIT.description,
    });
  });

  it("derives the slug from the name and suffixes a collision", async () => {
    await request(app).post(SHEET_BASE).send(RABBIT);

    const second = await request(app)
      .post(SHEET_BASE)
      .send({ ...RABBIT, worldId: null });

    expect(second.status).toBe(201);
    expect(second.body.data.slug).toBe("nibbles-2");
  });

  it("409s an explicitly supplied slug that is taken", async () => {
    await request(app)
      .post(SHEET_BASE)
      .send({ ...RABBIT, slug: "nibbles" });

    const res = await request(app)
      .post(SHEET_BASE)
      .send({ ...RABBIT, slug: "nibbles" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("409s rather than 500s when the slug is taken between the check and the write", async () => {
    // `assertSlugFree` is check-then-act, so two admins saving the same slug at
    // once both pass it and the loser hits the unique index. Unwrapped, Prisma's
    // P2002 reaches the error handler as an undocumented `500`; this endpoint
    // documents `409` and that is what a race should read as.
    await request(app)
      .post(SHEET_BASE)
      .send({ ...RABBIT, slug: "nibbles" });
    store.slugCheckMisses = 1;

    const res = await request(app)
      .post(SHEET_BASE)
      .send({ ...RABBIT, slug: "nibbles" });

    expect(res.status).toBe(409);
    expect(res.body.error.details).toMatchObject({ code: "DUPLICATE_SLUG" });
    expect(store.characterSheets).toHaveLength(1);
  });

  it("stores a world-less sheet as null rather than omitting the column", async () => {
    // A character used across every world is a fact worth recording, not a gap.
    const res = await request(app)
      .post(SHEET_BASE)
      .send({ name: "The Narrator", description: RABBIT.description });

    expect(res.status).toBe(201);
    expect(res.body.data.worldId).toBeNull();
  });

  it("400s a description too short to draw consistently from", async () => {
    // "a rabbit" contributes nothing an image model can be consistent about, and
    // a sheet that adds nothing makes the drift it exists to stop look like the
    // feature working.
    const res = await request(app)
      .post(SHEET_BASE)
      .send({ ...RABBIT, description: "a rabbit" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(store.characterSheets).toHaveLength(0);
  });

  it("400s a status the caller tried to smuggle in", async () => {
    // A sheet has no status at all — it is prompt input, never student-facing —
    // so `.strict()` rejects the key rather than storing a meaningless column.
    const res = await request(app)
      .post(SHEET_BASE)
      .send({ ...RABBIT, status: "published" });

    expect(res.status).toBe(400);
    expect(store.characterSheets).toHaveLength(0);
  });

  it("404s a worldId that names no world", async () => {
    const res = await request(app)
      .post(SHEET_BASE)
      .send({ ...RABBIT, worldId: SUBJECT_ID });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("GET /api/admin/content/character-sheets", () => {
  const SHEET_BASE = `${BASE}/character-sheets`;

  beforeEach(() => {
    store.characterSheets.push(
      {
        id: "sheet-jungle",
        slug: "nibbles",
        name: "Nibbles",
        worldId: WORLD_ID,
        description: "A small white rabbit with one grey ear and a red scarf.",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      {
        id: "sheet-global",
        slug: "the-narrator",
        name: "The Narrator",
        worldId: null,
        description: "A warm grandmotherly figure in a soft blue shawl.",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      {
        id: "sheet-ocean",
        slug: "shelly",
        name: "Shelly",
        worldId: SUBJECT_ID,
        description: "A small green turtle with a bright blue patterned shell.",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    );
  });

  it("200s with every sheet when unfiltered", async () => {
    const res = await request(app).get(SHEET_BASE);

    expect(res.status).toBe(200);
    assertContract(
      CharacterSheetListResponseSchema,
      res.body,
      "GET /api/admin/content/character-sheets",
    );
    expect(res.body.data).toHaveLength(3);
  });

  it("narrows ?worldId= to that world plus the world-less sheets", async () => {
    // The same set the illustration generator applies to a story set there. A
    // filter answering differently would show an author a cast their pictures do
    // not use.
    const res = await request(app).get(`${SHEET_BASE}?worldId=${WORLD_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((sheet: { slug: string }) => sheet.slug)).toEqual([
      "nibbles",
      "the-narrator",
    ]);
  });

  it("400s an unknown query parameter", async () => {
    const res = await request(app).get(`${SHEET_BASE}?world=jungle`);

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/admin/content/character-sheets/{id}", () => {
  const SHEET_BASE = `${BASE}/character-sheets`;
  const SHEET_ID = "eeeeeeee-0000-4000-8000-0000000000aa";

  beforeEach(() => {
    seed(store.worlds, { id: WORLD_ID, slug: "jungle", name: "Jungle" });
    store.characterSheets.push({
      id: SHEET_ID,
      slug: "nibbles",
      name: "Nibbles",
      worldId: WORLD_ID,
      description: "A small white rabbit with one grey ear and a red scarf.",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
  });

  it("200s with the rewritten description", async () => {
    const res = await request(app).patch(`${SHEET_BASE}/${SHEET_ID}`).send({
      description:
        "A small white rabbit with one grey ear, wearing a green scarf.",
    });

    expect(res.status).toBe(200);
    assertContract(
      CharacterSheetResponseSchema,
      res.body,
      "PATCH /api/admin/content/character-sheets/{id}",
    );
    expect(res.body.data.description).toContain("green scarf");
  });

  it("400s a body that names a slug", async () => {
    // The slug is how an import recognises a saved character, so one that could
    // change would let the same mascot be imported twice under two names.
    const res = await request(app)
      .patch(`${SHEET_BASE}/${SHEET_ID}`)
      .send({ slug: "nibbles-the-rabbit" });

    expect(res.status).toBe(400);
    expect(store.characterSheets[0].slug).toBe("nibbles");
  });

  it("400s an empty body", async () => {
    const res = await request(app).patch(`${SHEET_BASE}/${SHEET_ID}`).send({});

    expect(res.status).toBe(400);
  });

  it("404s an unknown id", async () => {
    const res = await request(app)
      .patch(`${SHEET_BASE}/${LESSON_ID}`)
      .send({ name: "Nibbles the Brave" });

    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/content/character-sheets/from-job", () => {
  const FROM_JOB = `${BASE}/character-sheets/from-job`;
  const JOB_ID = "eeeeeeee-0000-4000-8000-000000000001";
  const STORY_ID = "ffffffff-0000-4000-8000-000000000001";

  function storyJob(characters: Array<Record<string, unknown>>): Row {
    return {
      id: JOB_ID,
      type: "story",
      status: "awaiting_review",
      rawOutput: {
        parsed: { characterDescriptions: characters },
        entities: { storyId: STORY_ID },
      },
    };
  }

  beforeEach(() => {
    seed(store.worlds, { id: WORLD_ID, slug: "jungle", name: "Jungle" });
    store.stories.push({ id: STORY_ID, worldId: WORLD_ID });
  });

  it("201s with the sheets it created, scoped to the story's world", async () => {
    store.jobs.push(
      storyJob([
        {
          name: "Nibbles",
          kind: "rabbit",
          visualDescription:
            "A small white rabbit with one grey ear and a red scarf.",
        },
        {
          name: "Professor Hoot",
          kind: "owl",
          visualDescription: "A round brown owl in large round glasses.",
        },
      ]),
    );

    const res = await request(app).post(FROM_JOB).send({ jobId: JOB_ID });

    expect(res.status).toBe(201);
    assertContract(
      PromotedCharacterSheetsResponseSchema,
      res.body,
      "POST /api/admin/content/character-sheets/from-job",
    );
    expect(res.body.data.created).toHaveLength(2);
    expect(res.body.data.skipped).toBe(0);
    expect(
      res.body.data.created.map((sheet: { slug: string }) => sheet.slug),
    ).toEqual(["nibbles", "professor-hoot"]);
    expect(res.body.data.created[0].worldId).toBe(WORLD_ID);
  });

  it("counts a slug lost to a concurrent import as skipped, not as a 500", async () => {
    // The window the `findUnique` above it cannot cover: a second admin (or a
    // double-click) inserted the same slug between the check and the write. The
    // import is idempotent by slug, so the loser of that race means the character
    // is saved — which is a `skipped`, exactly as finding it taken would be.
    store.jobs.push(
      storyJob([
        {
          name: "Nibbles",
          kind: "rabbit",
          visualDescription: "A small white rabbit with one grey ear.",
        },
      ]),
    );
    store.characterSheets.push({
      id: "sheet-existing",
      slug: "nibbles",
      name: "Nibbles",
      worldId: WORLD_ID,
      description: "Written by the request that won the race.",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    store.slugCheckMisses = 1;

    const res = await request(app).post(FROM_JOB).send({ jobId: JOB_ID });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ created: [], skipped: 1 });
    expect(store.characterSheets).toHaveLength(1);
  });

  it("skips a character whose slug already has a sheet, without overwriting it", async () => {
    // The second story in a world describes the same mascot in slightly
    // different words; taking the newer wording would change how it is drawn in
    // every story already using it (FR-AI-09).
    store.characterSheets.push({
      id: "sheet-existing",
      slug: "nibbles",
      name: "Nibbles",
      worldId: WORLD_ID,
      description: "The original wording, which must survive this import.",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    store.jobs.push(
      storyJob([
        {
          name: "Nibbles",
          kind: "rabbit",
          visualDescription: "A rewritten rabbit description from a new story.",
        },
      ]),
    );

    const res = await request(app).post(FROM_JOB).send({ jobId: JOB_ID });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ created: [], skipped: 1 });
    expect(store.characterSheets[0].description).toBe(
      "The original wording, which must survive this import.",
    );
  });

  it("404s an unknown job", async () => {
    const res = await request(app).post(FROM_JOB).send({ jobId: JOB_ID });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("409s a job that is not a story generation", async () => {
    store.jobs.push({ ...storyJob([]), type: "lesson" });

    const res = await request(app).post(FROM_JOB).send({ jobId: JOB_ID });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("409s a job whose output holds no character descriptions", async () => {
    // A `failed` generation that never produced a valid answer. `409` rather
    // than `404`: the job exists, and what is wrong is its contents.
    store.jobs.push({
      id: JOB_ID,
      type: "story",
      status: "failed",
      rawOutput: { attempts: [] },
    });

    const res = await request(app).post(FROM_JOB).send({ jobId: JOB_ID });

    expect(res.status).toBe(409);
    expect(store.characterSheets).toHaveLength(0);
  });
});
