import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Asserts the declarations the stubbed `apps/server` suites say they cannot prove, by reading `schema.prisma` as text
 * (the generated client cannot report referential actions). Not a substitute for Postgres; these become behavioural
 * tests when the test-database harness lands.
 */

const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);

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
  /** `deleteChildProfile` trusts Postgres for the cascade; asserted here because this package owns the declaration. */
  it("cascades every child-owned relation from ChildProfile", () => {
    const relations = schema
      .split("\n")
      .filter((line) => /^\s*child\s+ChildProfile\b/.test(line));

    expect(relations).toHaveLength(8);
    for (const relation of relations) {
      expect(relation).toContain("onDelete: Cascade");
    }
  });

  it("cascades ChildProfile from Parent, and Parent from the auth identity", () => {
    // `User → Parent → ChildProfile → everything` makes `confirmAccountDeletion` a total erasure rather than a sweep.
    expect(field("ChildProfile", "parent")).toContain("onDelete: Cascade");
    expect(field("Parent", "user")).toContain("onDelete: Cascade");
  });

  it("cascades sessions and accounts from the auth identity", () => {
    // Deleting the account must invalidate the cookie the caller still holds.
    expect(field("Session", "user")).toContain("onDelete: Cascade");
    expect(field("Account", "user")).toContain("onDelete: Cascade");
  });

  it("does not cascade content away when a child is deleted", () => {
    // A child's deletion must never reach the curriculum; `Lesson.world`/`activity` have no referential action, so Postgres restricts.
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
    ["StoryTranslation", "story"],
    ["StoryPageTranslation", "storyPage"],
  ])("cascades %s from its owner", (model, relation) => {
    // An orphaned translation is unreachable yet still counts toward storage and locale-coverage reports.
    expect(field(model, relation)).toContain("onDelete: Cascade");
  });

  it.each([
    ["WorldTranslation", "worldId, language"],
    ["SubjectTranslation", "subjectId, language"],
    ["TopicTranslation", "topicId, language"],
    ["LessonTranslation", "lessonId, language"],
    ["ActivityTranslation", "activityId, language"],
    ["QuizQuestionTranslation", "questionId, language"],
    ["StoryTranslation", "storyId, language"],
    ["StoryPageTranslation", "storyPageId, language"],
  ])("holds one %s row per language", (model, key) => {
    // Two `en` rows for one lesson make `pickLocale` non-deterministic.
    expect(modelBlock(model).join("\n")).toContain(`@@unique([${key}])`);
  });
});

describe("per-child uniqueness", () => {
  it("holds one progress row per child per lesson", () => {
    // `reportLessonStep` upserts on this key; without it a replay creates a second row.
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
  /** Read responses promise one string already resolved to the child's language; before these tables only narration kept that promise. */
  it.each([
    ["WorldTranslation", "name"],
    ["SubjectTranslation", "name"],
    ["TopicTranslation", "name"],
    ["LessonTranslation", "title"],
    ["StoryTranslation", "title"],
  ])("declares %s.%s as required text", (model, column) => {
    const line = field(model, column);
    expect(line).toMatch(/\bString\b/);
    // Not nullable: a translation naming nothing would have to be treated as absent anyway.
    expect(line).not.toContain("String?");
  });

  it("keeps the admin label on the row itself", () => {
    // Both: the column feeds the CMS list and slug; a localised admin list is its own bug.
    expect(field("World", "name")).toMatch(/\bString\b/);
    expect(field("Subject", "name")).toMatch(/\bString\b/);
    expect(field("Topic", "name")).toMatch(/\bString\b/);
    expect(field("Lesson", "title")).toMatch(/\bString\b/);
    expect(field("Story", "title")).toMatch(/\bString\b/);
  });

  it("keeps a story's moral translatable and its authoring label required", () => {
    // `Story.theme` is the always-present authoring label; the translated one is optional because a story is publishable before every locale exists.
    expect(field("Story", "theme")).not.toContain("String?");
    expect(field("StoryTranslation", "moral")).toContain("String?");
  });
});

describe("the parental PIN is gone (was FR-AUTH-04)", () => {
  /** Asserted as absences because `prisma db pull` against an unmigrated database would restore every removed column. */
  it.each([
    ["Parent", "pinHash"],
    ["Parent", "pinFailedCount"],
    ["Parent", "pinLockoutStrikes"],
    ["Parent", "pinLockedUntil"],
    ["Session", "pinVerifiedUntil"],
  ])("declares no %s.%s", (model, column) => {
    const line = modelBlock(model).find((l) =>
      new RegExp(`^\\s*${column}\\s`).test(l),
    );
    expect(line).toBeUndefined();
  });

  it("keeps the deletion token, which is now the only guard on erasure", () => {
    expect(field("Parent", "deleteToken")).toContain("String?");
    expect(field("Parent", "deleteTokenExpiresAt")).toContain("DateTime?");
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
    // Publish guards match payload asset URLs with `url IN (...)`.
    ["MediaAsset", "@@index([url])"],
    // The AI review gate finds rows by the job that wrote them.
    ["MediaAsset", "@@index([aiJobId])"],
    ["Lesson", "@@index([aiJobId])"],
    ["Activity", "@@index([aiJobId])"],
    ["Quiz", "@@index([aiJobId])"],
    ["QuizQuestion", "@@index([aiJobId])"],
    ["Story", "@@index([aiJobId])"],
  ])("indexes %s on %s", (model, index) => {
    expect(modelBlock(model).join("\n")).toContain(index);
  });
});

describe("student-facing content carries a status column", () => {
  /** `backend.md §4`: student queries filter `status: "published"`, so every student-reachable model needs the column. */
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
    // Defaulting to `draft` makes an unfinished row invisible by omission.
    expect(line).toContain("@default(draft)");
  });
});

describe("runtime and migration connections stay separate", () => {
  it("uses the pooled url at runtime and the direct one for migrations", () => {
    // Runtime uses the pooler; `prisma migrate` cannot, as pgbouncer transaction mode lacks the advisory locks it takes.
    expect(schema).toContain('url       = env("DATABASE_URL")');
    expect(schema).toContain('directUrl = env("DIRECT_URL")');
  });
});
