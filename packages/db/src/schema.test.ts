import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Schema invariants, asserted against `schema.prisma` itself.
 *
 * ## Why this file exists at all
 *
 * `general.md §5` wants `packages/db` covered by tests against a real test
 * database — schema constraints, cascade deletes, index correctness. There is no
 * such harness yet (see the recorded exception in that section), and until there is
 * the package had **no test script**, which meant `turbo run test` skipped it in
 * silence. A package that cannot fail is not the same as a package that passes.
 *
 * ## What these tests are, and are not
 *
 * They read the schema as text and assert the *declarations* that the stubbed
 * `apps/server` suites explicitly say they cannot prove. That is a real guard —
 * every defect here is a one-line deletion someone could make while refactoring,
 * and no other test in the monorepo would notice — but it is not a substitute for
 * exercising Postgres. When the test-database harness lands, these become
 * behavioural tests and this note goes away.
 *
 * Deliberately text-based rather than reading the generated Prisma client: the
 * client cannot report referential actions, which is most of what matters below.
 */

const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);

/** The lines of one `model X { … }` block. */
function modelBlock(name: string): string[] {
  const lines = schema.split("\n");
  const start = lines.findIndex((line) =>
    new RegExp(`^model ${name}\\s*\\{`).test(line),
  );
  expect(start, `model ${name} not found in schema.prisma`).toBeGreaterThan(-1);
  const end = lines.findIndex((line, i) => i > start && /^\}/.test(line));
  return lines.slice(start + 1, end);
}

function field(model: string, name: string): string {
  const line = modelBlock(model).find((l) =>
    new RegExp(`^\\s*${name}\\s`).test(l),
  );
  expect(line, `${model}.${name} not found`).toBeDefined();
  return line as string;
}

describe("right-to-erasure cascades (NFR-SAFE-05/06)", () => {
  /**
   * `deleteChildProfile` deletes one row and trusts Postgres for the rest. The
   * same claim is asserted from the server suite; it is repeated here because this
   * is the package that owns the declaration, and the server's copy would not
   * survive that suite being ported to a real database.
   */
  it("cascades every child-owned relation from ChildProfile", () => {
    const relations = schema
      .split("\n")
      .filter((line) => /^\s*child\s+ChildProfile\b/.test(line));

    // LessonProgress, QuizResponse, RewardLedger, ChildCharacter, Streak,
    // ScreenTimeSetting, SessionEvent, WeeklyReport.
    expect(relations).toHaveLength(8);
    for (const relation of relations) {
      expect(relation).toContain("onDelete: Cascade");
    }
  });

  it("cascades ChildProfile from Parent, and Parent from the auth identity", () => {
    // The chain `User → Parent → ChildProfile → everything` is what makes
    // `confirmAccountDeletion` a synchronous, total erasure rather than a sweep.
    expect(field("ChildProfile", "parent")).toContain("onDelete: Cascade");
    expect(field("Parent", "user")).toContain("onDelete: Cascade");
  });

  it("cascades sessions and accounts from the auth identity", () => {
    // Deleting the account has to invalidate the cookie the caller still holds.
    expect(field("Session", "user")).toContain("onDelete: Cascade");
    expect(field("Account", "user")).toContain("onDelete: Cascade");
  });

  it("does not cascade content away when a child is deleted", () => {
    // The reverse direction would be catastrophic: a child's deletion must never
    // reach the curriculum. `Lesson.world` and `Lesson.activity` carry no
    // referential action, so Postgres restricts by default.
    expect(field("Lesson", "world")).not.toContain("onDelete: Cascade");
    expect(field("Lesson", "activity")).not.toContain("onDelete: Cascade");
    expect(field("Lesson", "quiz")).not.toContain("onDelete: Cascade");
  });
});

describe("content translations cascade with their parent row", () => {
  it.each([
    ["WorldTranslation", "world"],
    ["SubjectTranslation", "subject"],
    ["TopicTranslation", "topic"],
    ["LessonTranslation", "lesson"],
    ["ActivityTranslation", "activity"],
    ["QuizQuestionTranslation", "question"],
    ["StoryPageTranslation", "storyPage"],
  ])("cascades %s from its owner", (model, relation) => {
    // An orphaned translation is unreachable content that still counts against
    // storage and still appears in a locale-coverage report.
    expect(field(model, relation)).toContain("onDelete: Cascade");
  });

  it.each([
    ["WorldTranslation", "worldId, language"],
    ["SubjectTranslation", "subjectId, language"],
    ["TopicTranslation", "topicId, language"],
    ["LessonTranslation", "lessonId, language"],
    ["ActivityTranslation", "activityId, language"],
    ["QuizQuestionTranslation", "questionId, language"],
    ["StoryPageTranslation", "storyPageId, language"],
  ])("holds one %s row per language", (model, key) => {
    // Two `en` rows for one lesson makes `pickLocale` non-deterministic — the
    // child's narration would change between requests.
    expect(modelBlock(model).join("\n")).toContain(`@@unique([${key}])`);
  });
});

describe("per-child uniqueness", () => {
  it("holds one progress row per child per lesson", () => {
    // `reportLessonStep` upserts on this key; without it a replay creates a second
    // row and the resume point becomes whichever one is read first.
    expect(modelBlock("LessonProgress").join("\n")).toContain(
      "@@unique([childId, lessonId])",
    );
  });

  it("holds one streak and one screen-time setting per child", () => {
    expect(field("Streak", "childId")).toContain("@unique");
    expect(field("ScreenTimeSetting", "childId")).toContain("@unique");
  });

  it("cannot unlock the same character for a child twice", () => {
    expect(modelBlock("ChildCharacter").join("\n")).toContain(
      "@@unique([childId, characterId])",
    );
  });

  it("holds one weekly report per child per week", () => {
    expect(modelBlock("WeeklyReport").join("\n")).toContain(
      "@@unique([childId, weekStart])",
    );
  });
});

describe("child-facing curriculum names are translatable (FR-I18N-01)", () => {
  /**
   * The read API's response contract promises one string already resolved to the
   * child's language. It could only keep that promise for narration until these
   * tables existed — every name around it came from the untranslated column, so a
   * Bangla learner met English tiles inside a Bangla lesson.
   */
  it.each([
    ["WorldTranslation", "name"],
    ["SubjectTranslation", "name"],
    ["TopicTranslation", "name"],
    ["LessonTranslation", "title"],
  ])("declares %s.%s as required text", (model, column) => {
    const line = field(model, column);
    expect(line).toMatch(/\bString\b/);
    // Not nullable: a translation row that exists but names nothing is a row the
    // resolver would have to treat as absent, which is what omitting it means.
    expect(line).not.toContain("String?");
  });

  it("keeps the admin label on the row itself", () => {
    // Both, not one. The column is what a CMS list and a slug are built from; a
    // localised admin list is its own bug.
    expect(field("World", "name")).toMatch(/\bString\b/);
    expect(field("Subject", "name")).toMatch(/\bString\b/);
    expect(field("Topic", "name")).toMatch(/\bString\b/);
    expect(field("Lesson", "title")).toMatch(/\bString\b/);
  });
});

describe("the PIN brute-force guard's columns", () => {
  /**
   * `parentSecurityService` claims an attempt with an atomic conditional `UPDATE`
   * on `pinFailedCount`, and escalates the cool-off from `pinLockoutStrikes`. Both
   * must be non-null with a zero default, or the predicate `pinFailedCount < 5`
   * silently never matches for a row that predates them and the parent is locked
   * out for good.
   */
  it.each([
    "pinFailedCount",
    "pinLockoutStrikes",
  ])("declares %s as a non-null Int defaulting to 0", (column) => {
    const line = field("Parent", column);
    expect(line).toMatch(/\bInt\b/);
    expect(line).not.toContain("Int?");
    expect(line).toContain("@default(0)");
  });

  it("keeps the lockout and grant expiries nullable", () => {
    // `null` means "no cool-off running" / "no grant", which is the resting state.
    expect(field("Parent", "pinLockedUntil")).toContain("DateTime?");
    expect(field("Session", "pinVerifiedUntil")).toContain("DateTime?");
  });
});

describe("indexes on the columns the read paths filter by", () => {
  it.each([
    ["ChildProfile", "@@index([parentId])"],
    ["Topic", "@@index([subjectId, sortOrder])"],
    ["Lesson", "@@index([topicId, sortOrder])"],
    ["Lesson", "@@index([worldId])"],
    ["SessionEvent", "@@index([childId, occurredAt])"],
    ["RewardLedger", "@@index([childId, createdAt])"],
    ["QuizResponse", "@@index([childId, answeredAt])"],
  ])("indexes %s on %s", (model, index) => {
    expect(modelBlock(model).join("\n")).toContain(index);
  });
});

describe("student-facing content carries a status column", () => {
  /**
   * `backend.md §4` — every student-facing query filters `status: "published"`.
   * That rule is only expressible if the column exists on every model a student
   * can reach, so a new content model without one is a content-safety bug at the
   * schema level, before any query is written.
   */
  it.each([
    "World",
    "Subject",
    "Topic",
    "Lesson",
    "Activity",
    "Quiz",
    "Story",
    "Badge",
    "Character",
  ])("declares %s.status defaulting to draft", (model) => {
    const line = field(model, "status");
    expect(line).toContain("ContentStatus");
    // Defaulting to `draft` is what makes an unfinished row invisible by
    // omission rather than by remembering to set it.
    expect(line).toContain("@default(draft)");
  });
});

describe("runtime and migration connections stay separate", () => {
  it("uses the pooled url at runtime and the direct one for migrations", () => {
    // Runtime goes through the Supabase pooler; `prisma migrate` cannot, because
    // pgbouncer in transaction mode does not support the advisory locks it takes.
    expect(schema).toContain('url       = env("DATABASE_URL")');
    expect(schema).toContain('directUrl = env("DIRECT_URL")');
  });
});
