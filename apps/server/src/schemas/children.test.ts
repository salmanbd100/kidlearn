import { describe, expect, it } from "vitest";
import {
  ChildIdParamsSchema,
  CreateChildBodySchema,
  UpdateChildBodySchema,
} from "./children.js";

const VALID_BODY = {
  firstName: "Ayaan",
  age: 4,
  gradeLevel: "KG1",
  preferredLanguage: "bn",
  avatarCharacterId: "character_1",
};

describe("CreateChildBodySchema", () => {
  it("accepts a complete, valid body", () => {
    expect(CreateChildBodySchema.parse(VALID_BODY)).toEqual(VALID_BODY);
  });

  it("trims surrounding whitespace from firstName", () => {
    const parsed = CreateChildBodySchema.parse({
      ...VALID_BODY,
      firstName: "  Ayaan  ",
    });

    expect(parsed.firstName).toBe("Ayaan");
  });

  it("rejects a firstName that is only whitespace", () => {
    expect(
      CreateChildBodySchema.safeParse({ ...VALID_BODY, firstName: "   " })
        .success,
    ).toBe(false);
  });

  it("rejects a firstName longer than 50 characters", () => {
    expect(
      CreateChildBodySchema.safeParse({
        ...VALID_BODY,
        firstName: "a".repeat(51),
      }).success,
    ).toBe(false);
  });

  it.each([2, 7, 3.5])("rejects age %s — only whole years 3–6", (age) => {
    expect(
      CreateChildBodySchema.safeParse({ ...VALID_BODY, age }).success,
    ).toBe(false);
  });

  it.each([3, 4, 5, 6])("accepts age %s", (age) => {
    expect(
      CreateChildBodySchema.safeParse({ ...VALID_BODY, age }).success,
    ).toBe(true);
  });

  it("rejects a gradeLevel outside the NURSERY/KG1/KG2 set", () => {
    expect(
      CreateChildBodySchema.safeParse({ ...VALID_BODY, gradeLevel: "grade1" })
        .success,
    ).toBe(false);
  });

  it("treats gradeLevel as case-sensitive — the Prisma enum is uppercase", () => {
    expect(
      CreateChildBodySchema.safeParse({ ...VALID_BODY, gradeLevel: "kg1" })
        .success,
    ).toBe(false);
  });

  it.each(["NURSERY", "KG1", "KG2"])("accepts gradeLevel %s", (gradeLevel) => {
    expect(
      CreateChildBodySchema.safeParse({ ...VALID_BODY, gradeLevel }).success,
    ).toBe(true);
  });

  it("rejects a preferredLanguage outside en/bn", () => {
    expect(
      CreateChildBodySchema.safeParse({
        ...VALID_BODY,
        preferredLanguage: "ar",
      }).success,
    ).toBe(false);
  });

  it("requires avatarCharacterId even though the column is nullable", () => {
    const { avatarCharacterId: _omitted, ...withoutAvatar } = VALID_BODY;

    expect(CreateChildBodySchema.safeParse(withoutAvatar).success).toBe(false);
  });

  it("rejects an unknown key rather than silently dropping it", () => {
    expect(
      CreateChildBodySchema.safeParse({ ...VALID_BODY, parentId: "parent_2" })
        .success,
    ).toBe(false);
  });
});

describe("UpdateChildBodySchema", () => {
  it("accepts a single-field partial update", () => {
    expect(UpdateChildBodySchema.parse({ firstName: "Nabila" })).toEqual({
      firstName: "Nabila",
    });
  });

  it("rejects an empty body — a PATCH must change something", () => {
    expect(UpdateChildBodySchema.safeParse({}).success).toBe(false);
  });

  it("applies the same field validators as create", () => {
    expect(UpdateChildBodySchema.safeParse({ age: 9 }).success).toBe(false);
    expect(
      UpdateChildBodySchema.safeParse({ gradeLevel: "grade1" }).success,
    ).toBe(false);
  });

  it("refuses to reassign parentId", () => {
    expect(
      UpdateChildBodySchema.safeParse({ parentId: "parent_2" }).success,
    ).toBe(false);
  });
});

describe("ChildIdParamsSchema", () => {
  it("accepts a non-empty id", () => {
    expect(ChildIdParamsSchema.parse({ id: "child_1" })).toEqual({
      id: "child_1",
    });
  });

  it("rejects an empty id", () => {
    expect(ChildIdParamsSchema.safeParse({ id: "" }).success).toBe(false);
  });
});
