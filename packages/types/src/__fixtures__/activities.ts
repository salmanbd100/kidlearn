/**
 * Canonical activity payloads.
 *
 * The `valid*` fixtures are annotated with their inferred type, so the compiler
 * fails if a fixture drifts from its schema. They are the reference examples
 * reused by the content seed script (file 12) and the AI generation prompts
 * (file 34) — keep them realistic, not minimal.
 *
 * The `invalid*` fixtures are typed `unknown` on purpose: they must be
 * structurally wrong, which is exactly what the compiler would otherwise reject.
 */
import type {
  DragDropActivity,
  MatchActivity,
  PuzzleActivity,
  TraceActivity,
} from "../activity/schemas.js";
import type { ImageAssetRef, LocalizedAudio } from "../primitives.js";

const CDN = "https://cdn.kidlearn.test";

function image(name: string, en: string, bn: string): ImageAssetRef {
  return { kind: "image", url: `${CDN}/images/${name}.png`, alt: { en, bn } };
}

function audio(name: string): LocalizedAudio {
  return {
    en: { kind: "audio", url: `${CDN}/audio/en/${name}.mp3` },
    bn: { kind: "audio", url: `${CDN}/audio/bn/${name}.mp3` },
  };
}

export const validDragDrop: DragDropActivity = {
  schemaVersion: 1,
  type: "drag_drop",
  instructionAudio: audio("drag-the-animal-home"),
  items: [
    {
      id: "cow",
      label: { en: "Cow", bn: "গরু" },
      image: image("cow", "A cow", "একটি গরু"),
    },
    {
      id: "fish",
      label: { en: "Fish", bn: "মাছ" },
      image: image("fish", "A fish", "একটি মাছ"),
    },
  ],
  targets: [
    {
      id: "farm",
      label: { en: "Farm", bn: "খামার" },
      image: image("farm", "A farm", "একটি খামার"),
    },
    {
      id: "pond",
      label: { en: "Pond", bn: "পুকুর" },
      image: image("pond", "A pond", "একটি পুকুর"),
    },
  ],
  correctMappings: [
    { itemId: "cow", targetId: "farm" },
    { itemId: "fish", targetId: "pond" },
  ],
};

/** `correctMappings` points at a target id that does not exist. */
export const invalidDragDropUnknownTarget: unknown = {
  ...validDragDrop,
  correctMappings: [
    { itemId: "cow", targetId: "barn" },
    { itemId: "fish", targetId: "pond" },
  ],
};

/** `fish` is left without any mapping, so the child could never complete it. */
export const invalidDragDropUnmappedItem: unknown = {
  ...validDragDrop,
  correctMappings: [{ itemId: "cow", targetId: "farm" }],
};

/** Stored payloads must keep declaring version 1 until a v2 schema ships. */
export const invalidDragDropWrongVersion: unknown = {
  ...validDragDrop,
  schemaVersion: 2,
};

/**
 * Capital A as three strokes: up-stroke, down-stroke, crossbar. `pathData` has
 * one `M` command per stroke and `strokeOrder` indexes them, so the fixture
 * stays internally consistent for the AI prompt examples that reuse it.
 */
export const validTrace: TraceActivity = {
  schemaVersion: 1,
  type: "trace",
  instructionAudio: audio("trace-the-letter-a"),
  glyph: "A",
  pathData: "M 20 180 L 100 20 M 100 20 L 180 180 M 55 110 L 145 110",
  guideDots: [
    { x: 20, y: 180 },
    { x: 100, y: 20 },
    { x: 180, y: 180 },
    { x: 55, y: 110 },
    { x: 145, y: 110 },
  ],
  strokeOrder: [0, 1, 2],
};

/** Bangla digit three — proves the glyph field is not ASCII-only. */
export const validTraceBangla: TraceActivity = {
  schemaVersion: 1,
  type: "trace",
  instructionAudio: audio("trace-the-number-three-bn"),
  glyph: "৩",
  pathData: "M 60 40 C 140 40 140 100 80 100 C 150 100 150 170 60 160",
  guideDots: [
    { x: 60, y: 40 },
    { x: 110, y: 70 },
    { x: 80, y: 100 },
    { x: 60, y: 160 },
  ],
};

/** A single dot gives the renderer no direction to trace in. */
export const invalidTraceTooFewGuideDots: unknown = {
  ...validTrace,
  guideDots: [{ x: 20, y: 180 }],
};

export const invalidTraceEmptyPathData: unknown = {
  ...validTrace,
  pathData: "",
};

export const validMatch: MatchActivity = {
  schemaVersion: 1,
  type: "match",
  instructionAudio: audio("match-the-shadow"),
  leftSet: [
    {
      id: "sun",
      label: { en: "Sun", bn: "সূর্য" },
      image: image("sun", "The sun", "সূর্য"),
    },
    {
      id: "moon",
      label: { en: "Moon", bn: "চাঁদ" },
      image: image("moon", "The moon", "চাঁদ"),
    },
  ],
  rightSet: [
    {
      id: "day",
      label: { en: "Day", bn: "দিন" },
      image: image("day", "Daytime", "দিনের বেলা"),
    },
    {
      id: "night",
      label: { en: "Night", bn: "রাত" },
      image: image("night", "Night", "রাত"),
    },
  ],
  pairs: [
    { leftId: "sun", rightId: "day" },
    { leftId: "moon", rightId: "night" },
  ],
};

/** `day` is claimed by both pairs — a one-to-many match has no single right answer. */
export const invalidMatchReusedRightId: unknown = {
  ...validMatch,
  pairs: [
    { leftId: "sun", rightId: "day" },
    { leftId: "moon", rightId: "day" },
  ],
};

export const invalidMatchUnknownLeftId: unknown = {
  ...validMatch,
  pairs: [{ leftId: "star", rightId: "night" }],
};

export const validPuzzle: PuzzleActivity = {
  schemaVersion: 1,
  type: "puzzle",
  instructionAudio: audio("build-the-picture"),
  image: image("elephant", "An elephant", "একটি হাতি"),
  grid: { rows: 2, cols: 2 },
  slots: [
    { index: 0, row: 0, col: 0 },
    { index: 1, row: 0, col: 1 },
    { index: 2, row: 1, col: 0 },
    { index: 3, row: 1, col: 1 },
  ],
};

/** Three slots cannot tile a 2×2 grid. */
export const invalidPuzzleSlotCount: unknown = {
  ...validPuzzle,
  slots: validPuzzle.slots.slice(0, 3),
};

/** Row 2 is off the board on a 2×2 grid. */
export const invalidPuzzleSlotOutOfGrid: unknown = {
  ...validPuzzle,
  slots: [
    { index: 0, row: 0, col: 0 },
    { index: 1, row: 0, col: 1 },
    { index: 2, row: 1, col: 0 },
    { index: 3, row: 2, col: 0 },
  ],
};

/** A `type` no renderer implements. */
export const invalidActivityUnknownType: unknown = {
  schemaVersion: 1,
  type: "nope",
};
