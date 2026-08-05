import type { ChildProfile, ContentStatus } from "@kidlearn/db";
import { describe, expect, it } from "vitest";
import {
  isPublished,
  publishedForChild,
  publishedOnly,
  publishedRelation,
} from "./published-for-child.js";

function child(gradeLevel: ChildProfile["gradeLevel"]): ChildProfile {
  return {
    id: "child_1",
    firstName: "Ava",
    age: 4,
    gradeLevel,
    preferredLanguage: "en",
    avatarCharacterId: null,
    parentId: "parent_1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("publishedForChild", () => {
  it("restricts to published content tagged for the child's own grade", () => {
    expect(publishedForChild(child("NURSERY"))).toEqual({
      status: "published",
      gradeLevels: { has: "NURSERY" },
    });
  });

  it("tracks the grade of whichever child is asking", () => {
    expect(publishedForChild(child("KG2")).gradeLevels.has).toBe("KG2");
  });

  it("never widens beyond published, whatever the grade", () => {
    for (const grade of ["NURSERY", "KG1", "KG2"] as const) {
      expect(publishedForChild(child(grade)).status).toBe("published");
    }
  });
});

describe("publishedOnly", () => {
  it("restricts to published content without a grade condition", () => {
    // Worlds are not grade-tagged: the lessons inside them are.
    expect(publishedOnly).toEqual({ status: "published" });
  });
});

describe("publishedRelation", () => {
  it("wraps the status gate as a to-one relation filter", () => {
    // For a row whose visibility depends on one it points at — `Lesson.world`.
    // Prisma cannot filter an `include`, so this belongs in `where`.
    expect(publishedRelation).toEqual({ is: { status: "published" } });
  });
});

describe("isPublished", () => {
  const HIDDEN: ContentStatus[] = [
    "draft",
    "in_review",
    "approved",
    "rejected",
    "archived",
  ];

  it("accepts a published row", () => {
    expect(isPublished({ status: "published" })).toBe(true);
  });

  it.each(HIDDEN)("rejects a row in %s", (status) => {
    // `approved` is the trap: it has cleared human review but has not been
    // published, so it is still not something a child may see.
    expect(isPublished({ status })).toBe(false);
  });

  it("treats an absent row as not published, so a missing relation fails closed", () => {
    expect(isPublished(null)).toBe(false);
    expect(isPublished(undefined)).toBe(false);
  });
});
