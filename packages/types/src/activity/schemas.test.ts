import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  invalidActivityUnknownType,
  invalidDragDropUnknownTarget,
  invalidDragDropUnmappedItem,
  invalidDragDropWrongVersion,
  invalidMatchReusedRightId,
  invalidMatchUnknownLeftId,
  invalidMatchUnpairedLeftItem,
  invalidPuzzleSlotCount,
  invalidPuzzleSlotOutOfGrid,
  invalidTraceEmptyPathData,
  invalidTraceTooFewGuideDots,
  validDragDrop,
  validMatch,
  validPuzzle,
  validTrace,
  validTraceBangla,
} from "../__fixtures__/activities.js";
import {
  AssetRefSchema,
  LocalizedAudioSchema,
  LocalizedTextSchema,
  SCHEMA_VERSION,
} from "../primitives.js";
import {
  parseActivityDefinition,
  safeParseActivityDefinition,
} from "./parse.js";
import {
  ACTIVITY_TYPES,
  DragDropActivitySchema,
  MatchActivitySchema,
  PuzzleActivitySchema,
  TraceActivitySchema,
} from "./schemas.js";

/** One valid fixture per union member — the coverage test below depends on that. */
const VALID_ACTIVITY_FIXTURES = [
  ["drag_drop", validDragDrop],
  ["trace", validTrace],
  ["match", validMatch],
  ["puzzle", validPuzzle],
] as const;

describe("primitives", () => {
  it("pins the current content schema version at 1", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it("accepts an https asset reference with localized alt text", () => {
    const result = AssetRefSchema.safeParse({
      kind: "image",
      url: "https://cdn.kidlearn.test/images/cow.png",
      alt: { en: "A cow", bn: "একটি গরু" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed asset url", () => {
    expect(
      AssetRefSchema.safeParse({ kind: "image", url: "not-a-url" }).success,
    ).toBe(false);
  });

  it("rejects a plain http asset url", () => {
    const result = AssetRefSchema.safeParse({
      kind: "image",
      url: "http://cdn.kidlearn.test/images/cow.png",
    });
    expect(result.success).toBe(false);
  });

  it("rejects localized text that is missing the bn locale", () => {
    expect(LocalizedTextSchema.safeParse({ en: "Cow" }).success).toBe(false);
  });

  it("rejects an empty string in either locale", () => {
    expect(LocalizedTextSchema.safeParse({ en: "Cow", bn: "" }).success).toBe(
      false,
    );
  });

  it("rejects localized audio pointing at a non-audio asset", () => {
    const result = LocalizedAudioSchema.safeParse({
      en: { kind: "image", url: "https://cdn.kidlearn.test/audio/en/cow.mp3" },
      bn: { kind: "audio", url: "https://cdn.kidlearn.test/audio/bn/cow.mp3" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects localized audio that is missing the bn locale", () => {
    const result = LocalizedAudioSchema.safeParse({
      en: { kind: "audio", url: "https://cdn.kidlearn.test/audio/en/cow.mp3" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unsupported locale key instead of stripping it", () => {
    const result = LocalizedTextSchema.safeParse({
      en: "Cow",
      bn: "একটি গরু",
      hi: "गाय",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key on an asset reference", () => {
    const result = AssetRefSchema.safeParse({
      kind: "image",
      url: "https://cdn.kidlearn.test/images/cow.png",
      credit: "unsplash",
    });
    expect(result.success).toBe(false);
  });
});

describe("DragDropActivitySchema", () => {
  it("parses a valid drag-and-drop payload", () => {
    expect(DragDropActivitySchema.parse(validDragDrop)).toEqual(validDragDrop);
  });

  it("rejects a mapping that references an unknown target", () => {
    expect(
      DragDropActivitySchema.safeParse(invalidDragDropUnknownTarget).success,
    ).toBe(false);
  });

  it("rejects a payload where an item has no mapping", () => {
    expect(
      DragDropActivitySchema.safeParse(invalidDragDropUnmappedItem).success,
    ).toBe(false);
  });

  it("rejects an item mapped to two targets", () => {
    const result = DragDropActivitySchema.safeParse({
      ...validDragDrop,
      correctMappings: [
        { itemId: "cow", targetId: "farm" },
        { itemId: "cow", targetId: "pond" },
        { itemId: "fish", targetId: "pond" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate item ids", () => {
    const result = DragDropActivitySchema.safeParse({
      ...validDragDrop,
      items: [validDragDrop.items[0], validDragDrop.items[0]],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a single draggable item", () => {
    const result = DragDropActivitySchema.safeParse({
      ...validDragDrop,
      items: validDragDrop.items.slice(0, 1),
      correctMappings: [{ itemId: "cow", targetId: "farm" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a schemaVersion other than 1", () => {
    expect(
      DragDropActivitySchema.safeParse(invalidDragDropWrongVersion).success,
    ).toBe(false);
  });

  it("rejects an unknown top-level key instead of stripping it", () => {
    const result = DragDropActivitySchema.safeParse({
      ...validDragDrop,
      hint: { en: "Think about water", bn: "পানির কথা ভাবো" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key on a draggable item", () => {
    const result = DragDropActivitySchema.safeParse({
      ...validDragDrop,
      items: [
        { ...validDragDrop.items[0], hint: "moo" },
        validDragDrop.items[1],
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a drop target without an image", () => {
    const result = DragDropActivitySchema.safeParse({
      ...validDragDrop,
      targets: [
        { id: "farm", label: { en: "Farm", bn: "খামার" } },
        validDragDrop.targets[1],
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("TraceActivitySchema", () => {
  it("parses a valid latin-glyph trace payload", () => {
    expect(TraceActivitySchema.parse(validTrace)).toEqual(validTrace);
  });

  it("parses a bangla-glyph trace payload without a strokeOrder", () => {
    expect(TraceActivitySchema.parse(validTraceBangla)).toEqual(
      validTraceBangla,
    );
  });

  it("rejects fewer than two guide dots", () => {
    expect(
      TraceActivitySchema.safeParse(invalidTraceTooFewGuideDots).success,
    ).toBe(false);
  });

  it("rejects empty pathData", () => {
    expect(
      TraceActivitySchema.safeParse(invalidTraceEmptyPathData).success,
    ).toBe(false);
  });

  it("rejects whitespace-only pathData", () => {
    expect(
      TraceActivitySchema.safeParse({ ...validTrace, pathData: "   " }).success,
    ).toBe(false);
  });

  it("rejects an empty glyph", () => {
    expect(
      TraceActivitySchema.safeParse({ ...validTrace, glyph: "" }).success,
    ).toBe(false);
  });

  it("rejects a schemaVersion other than 1", () => {
    expect(
      TraceActivitySchema.safeParse({ ...validTrace, schemaVersion: 2 })
        .success,
    ).toBe(false);
  });
});

describe("MatchActivitySchema", () => {
  it("parses a valid match payload", () => {
    expect(MatchActivitySchema.parse(validMatch)).toEqual(validMatch);
  });

  it("rejects reusing the same right-hand id in two pairs", () => {
    expect(
      MatchActivitySchema.safeParse(invalidMatchReusedRightId).success,
    ).toBe(false);
  });

  it("rejects a pair referencing an unknown left-hand id", () => {
    expect(
      MatchActivitySchema.safeParse(invalidMatchUnknownLeftId).success,
    ).toBe(false);
  });

  it("rejects reusing the same left-hand id in two pairs", () => {
    const result = MatchActivitySchema.safeParse({
      ...validMatch,
      pairs: [
        { leftId: "sun", rightId: "day" },
        { leftId: "sun", rightId: "night" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a left-hand item that appears in no pair", () => {
    const result = MatchActivitySchema.safeParse(invalidMatchUnpairedLeftItem);
    expect(result.success).toBe(false);
    expect(
      result.success ? [] : result.error.issues.map((issue) => issue.message),
    ).toContainEqual(expect.stringContaining('"moon" has no pair'));
  });

  it("accepts a spare right-hand entry — a distractor is legitimate content", () => {
    const withDistractor = {
      ...validMatch,
      rightSet: [
        ...validMatch.rightSet,
        {
          id: "dusk",
          label: { en: "Dusk", bn: "সন্ধ্যা" },
          image: validMatch.rightSet[0].image,
        },
      ],
    };
    expect(MatchActivitySchema.safeParse(withDistractor).success).toBe(true);
  });

  it("rejects a schemaVersion other than 1", () => {
    expect(
      MatchActivitySchema.safeParse({ ...validMatch, schemaVersion: 2 })
        .success,
    ).toBe(false);
  });
});

describe("PuzzleActivitySchema", () => {
  it("parses a valid puzzle payload", () => {
    expect(PuzzleActivitySchema.parse(validPuzzle)).toEqual(validPuzzle);
  });

  it("rejects a slot count that does not equal rows times cols", () => {
    expect(PuzzleActivitySchema.safeParse(invalidPuzzleSlotCount).success).toBe(
      false,
    );
  });

  it("rejects a slot outside the declared grid", () => {
    expect(
      PuzzleActivitySchema.safeParse(invalidPuzzleSlotOutOfGrid).success,
    ).toBe(false);
  });

  it("rejects duplicate slot indexes", () => {
    const result = PuzzleActivitySchema.safeParse({
      ...validPuzzle,
      slots: [
        { index: 0, row: 0, col: 0 },
        { index: 0, row: 0, col: 1 },
        { index: 2, row: 1, col: 0 },
        { index: 3, row: 1, col: 1 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a grid larger than 4x4", () => {
    const result = PuzzleActivitySchema.safeParse({
      ...validPuzzle,
      grid: { rows: 5, cols: 2 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a schemaVersion other than 1", () => {
    expect(
      PuzzleActivitySchema.safeParse({ ...validPuzzle, schemaVersion: 2 })
        .success,
    ).toBe(false);
  });
});

describe("parseActivityDefinition", () => {
  it.each(
    VALID_ACTIVITY_FIXTURES,
  )("parses a valid %s payload through the union", (_type, fixture) => {
    expect(parseActivityDefinition(fixture)).toEqual(fixture);
  });

  it("lists every type the union accepts in ACTIVITY_TYPES", () => {
    const acceptedTypes = VALID_ACTIVITY_FIXTURES.map(
      ([, fixture]) => parseActivityDefinition(fixture).type,
    );
    expect([...ACTIVITY_TYPES].sort()).toEqual(acceptedTypes.sort());
  });

  it("narrows the parsed value on the type discriminant", () => {
    const definition = parseActivityDefinition(validDragDrop);
    if (definition.type !== "drag_drop") {
      throw new Error("expected a drag_drop activity");
    }
    expect(definition.items).toHaveLength(2);
  });

  it("throws ZodError for an unknown activity type", () => {
    expect(() => parseActivityDefinition(invalidActivityUnknownType)).toThrow(
      ZodError,
    );
  });

  it("throws ZodError for a non-object payload", () => {
    expect(() => parseActivityDefinition("drag_drop")).toThrow(ZodError);
  });

  it("returns issues instead of throwing when safe-parsing invalid input", () => {
    const result = safeParseActivityDefinition(invalidActivityUnknownType);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected the parse to fail");
    }
    expect(result.error.issues.length).toBeGreaterThan(0);
  });

  it("succeeds when safe-parsing valid input", () => {
    const result = safeParseActivityDefinition(validPuzzle);
    expect(result.success).toBe(true);
  });
});
