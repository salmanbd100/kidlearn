import type { ChildProfile } from "@kidlearn/db";
import { describe, expect, it } from "vitest";
import { publishedForChild, publishedOnly } from "./published-for-child.js";

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
