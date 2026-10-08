import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as activityFixtures from "./__fixtures__/activities.js";
import * as quizFixtures from "./__fixtures__/quiz.js";
import {
  ACTIVITY_MIGRATIONS,
  readActivityDefinition,
  safeParseActivityDefinition,
} from "./activity/parse.js";
import { SCHEMA_VERSION } from "./primitives.js";
import {
  QUIZ_QUESTION_MIGRATIONS,
  readQuizQuestion,
  safeParseQuizQuestion,
} from "./quiz/parse.js";
import { lenient, migratePayload } from "./versioning.js";

function byPrefix(fixtures: Record<string, unknown>, prefix: string) {
  return Object.entries(fixtures).filter(([name]) => name.startsWith(prefix));
}

const readers = [
  {
    name: "activity",
    fixtures: activityFixtures,
    strict: safeParseActivityDefinition,
    read: readActivityDefinition,
    migrations: ACTIVITY_MIGRATIONS,
  },
  {
    name: "quiz question",
    fixtures: quizFixtures,
    strict: safeParseQuizQuestion,
    read: readQuizQuestion,
    migrations: QUIZ_QUESTION_MIGRATIONS,
  },
] as const;

describe.each(readers)("reading a stored $name", (reader) => {
  it.each(
    byPrefix(reader.fixtures, "valid"),
  )("reads %s exactly as the strict parse does", (_name, payload) => {
    const strict = reader.strict(payload);
    const read = reader.read(payload);

    expect(strict.success).toBe(true);
    expect(read.success).toBe(true);
    expect(read.data).toEqual(strict.data);
  });

  it.each(
    byPrefix(reader.fixtures, "invalid"),
  )("still rejects %s — only unknown keys are forgiven", (_name, payload) => {
    expect(reader.read(payload).success).toBe(false);
  });

  it("has a migration from every version below the current one", () => {
    // Bumping SCHEMA_VERSION without a step from the previous version would
    // strand every stored row at the old one.
    for (let version = 1; version < SCHEMA_VERSION; version += 1) {
      expect(reader.migrations[version]).toBeTypeOf("function");
    }
  });
});

describe("unknown keys on read", () => {
  // Every depth a newer deploy might add a field at: the payload, an item, an
  // asset ref inside it, the localised text inside that, and the audio map.
  const withNewFields = {
    ...activityFixtures.validDragDrop,
    hint: "added by a newer deploy",
    instructionAudio: {
      ...activityFixtures.validDragDrop.instructionAudio,
      en: {
        ...activityFixtures.validDragDrop.instructionAudio.en,
        durationMs: 1200,
      },
    },
    items: activityFixtures.validDragDrop.items.map((item) => ({
      ...item,
      wobble: true,
      image: item.image && {
        ...item.image,
        width: 512,
        alt: item.image.alt && { ...item.image.alt, ar: "—" },
      },
    })),
  };

  it("are rejected by the write path", () => {
    expect(safeParseActivityDefinition(withNewFields).success).toBe(false);
  });

  it("are dropped at every depth by the read path", () => {
    const read = readActivityDefinition(withNewFields);

    expect(read.success).toBe(true);
    expect(read.data).toEqual(activityFixtures.validDragDrop);
  });

  it("are dropped from a quiz question too", () => {
    const read = readQuizQuestion({
      ...quizFixtures.validMcq,
      difficulty: "easy",
      options: quizFixtures.validMcq.options.map((option) => ({
        ...option,
        colour: "red",
      })),
    });

    expect(read.success).toBe(true);
    expect(read.data).toEqual(quizFixtures.validMcq);
  });

  it("do not excuse a missing required field", () => {
    const { instructionAudio: _, ...rest } = activityFixtures.validTrace;

    expect(readActivityDefinition({ ...rest, hint: "x" }).success).toBe(false);
  });
});

describe("lenient", () => {
  it("leaves the strict schema it was built from strict", () => {
    const Strict = z.object({ a: z.string() }).strict();
    const Lenient = lenient(Strict);

    expect(Lenient.safeParse({ a: "x", b: 1 }).success).toBe(true);
    expect(Strict.safeParse({ a: "x", b: 1 }).success).toBe(false);
  });

  it("keeps refinements", () => {
    const Refined = z
      .object({ n: z.number() })
      .strict()
      .refine((value) => value.n > 0);

    expect(lenient(Refined).safeParse({ n: -1, extra: 1 }).success).toBe(false);
    expect(lenient(Refined).safeParse({ n: 1, extra: 1 }).success).toBe(true);
  });

  it("throws on a construct it does not know rather than staying strict", () => {
    expect(() => lenient(z.object({ at: z.date() }))).toThrow(
      /unsupported schema type/,
    );
  });
});

describe("migratePayload", () => {
  // SCHEMA_VERSION is 1, so a "version 0" stands in for every older version.
  const toCurrent = {
    0: (payload: Record<string, unknown>) => {
      const { label, ...rest } = payload;
      return { ...rest, schemaVersion: 1, title: label };
    },
  };

  it("walks an older payload up to the current version", () => {
    expect(
      migratePayload({ schemaVersion: 0, label: "Cat" }, toCurrent),
    ).toEqual({ schemaVersion: 1, title: "Cat" });
  });

  it("returns a current payload as it is", () => {
    const payload = { schemaVersion: SCHEMA_VERSION, title: "Cat" };

    expect(migratePayload(payload, toCurrent)).toBe(payload);
  });

  it.each([
    ["a newer version than this code", { schemaVersion: SCHEMA_VERSION + 1 }],
    ["a gap in the chain", { schemaVersion: -1 }],
    ["no version", { title: "Cat" }],
    ["a non-integer version", { schemaVersion: 0.5 }],
    ["a string version", { schemaVersion: "0" }],
  ])("leaves %s untouched for the parse to reject", (_case, payload) => {
    expect(migratePayload(payload, toCurrent)).toBe(payload);
  });

  it.each([
    null,
    "text",
    [],
    42,
  ])("passes a non-object (%j) straight through", (payload) => {
    expect(migratePayload(payload, toCurrent)).toBe(payload);
  });

  it("gives up on a step that does not advance the version", () => {
    const payload = { schemaVersion: 0 };

    expect(migratePayload(payload, { 0: (p) => ({ ...p }) })).toBe(payload);
  });
});
