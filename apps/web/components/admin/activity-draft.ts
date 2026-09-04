import type {
  ActivityDefinition,
  ActivityType,
  Locale,
  PuzzleSlot,
} from "@kidlearn/types";
import { LOCALES } from "@kidlearn/types";

/**
 * The activity editor's form state, and the compiler that turns it into a payload
 * (FR-ACT-06).
 */

export type LocalizedDraft = Record<Locale, string>;

export interface ItemDraft {
  id: string;
  label: LocalizedDraft;
  /** A `MediaAsset` delivery URL, or empty for none. */
  imageUrl: string;
  /**
   * The image's alternative text, per locale. Carried even though the schema makes
   * it optional — an edit that dropped it would undescribe a picture silently.
   */
  imageAlt: LocalizedDraft;
  /** Per-locale audio URLs for the label, or empty for none. */
  audio: LocalizedDraft;
}

export interface ActivityDraft {
  type: ActivityType;
  /** Per-locale instruction audio URLs. Required in both, for every type. */
  instructionAudio: LocalizedDraft;
  /** `drag_drop` and `match`. */
  items: ItemDraft[];
  /** `drag_drop` targets / `match` right-hand set. */
  targets: ItemDraft[];
  /** Item id → target id. `drag_drop` maps every item; `match` pairs them. */
  mapping: Record<string, string>;
  /** `trace`. */
  glyph: string;
  pathData: string;
  guideDots: Array<{ x: number; y: number }>;
  /**
   * Which subpath is traced first, as the comma-separated list an author types.
   * Empty for a single-stroke glyph, which is what the schema means by omitting it.
   */
  strokeOrder: string;
  /** How far a finger may stray and still count, in the 0–100 glyph space. Empty = the renderer's default. */
  tolerance: string;
  /** `puzzle`. */
  imageUrl: string;
  imageAlt: LocalizedDraft;
  rows: number;
  cols: number;
  /** Slot indexes that start already filled, as a comma-separated list. */
  prePlaced: string;
}

const emptyLocalized = (): LocalizedDraft => ({ en: "", bn: "" });

export function emptyItem(index: number, prefix: string): ItemDraft {
  return {
    id: `${prefix}-${index + 1}`,
    label: emptyLocalized(),
    imageUrl: "",
    imageAlt: emptyLocalized(),
    audio: emptyLocalized(),
  };
}

/** The bounds every set-based activity type shares, from the shared schemas. */
export const MINIMUM_ITEMS = 2;
export const MAXIMUM_ITEMS = 6;

export function emptyActivityDraft(type: ActivityType): ActivityDraft {
  return {
    type,
    instructionAudio: emptyLocalized(),
    items: [emptyItem(0, "item"), emptyItem(1, "item")],
    targets: [emptyItem(0, "target"), emptyItem(1, "target")],
    mapping: {},
    glyph: "",
    pathData: "",
    strokeOrder: "",
    tolerance: "",
    // Two is the schema's floor. A single waypoint describes no direction, so a
    // trace built from one could not be scored.
    guideDots: [
      { x: 20, y: 20 },
      { x: 80, y: 80 },
    ],
    imageUrl: "",
    imageAlt: emptyLocalized(),
    rows: 2,
    cols: 2,
    prePlaced: "",
  };
}

/** A `LocalizedAudio`, or `undefined` when *neither* locale is filled. */
function localizedAudio(urls: LocalizedDraft) {
  if (LOCALES.every((locale) => urls[locale] === "")) return undefined;
  return Object.fromEntries(
    LOCALES.filter((locale) => urls[locale] !== "").map((locale) => [
      locale,
      { kind: "audio", url: urls[locale] },
    ]),
  );
}

/**
 * A `LocalizedText`, emitting only the locales that are filled — so a half-typed
 * label is reported as a missing locale rather than disappearing (FR-I18N-01).
 */
function localizedText(text: LocalizedDraft) {
  return Object.fromEntries(
    LOCALES.filter((locale) => text[locale] !== "").map((locale) => [
      locale,
      text[locale],
    ]),
  );
}

/** A comma-separated list of numbers, as the schema wants it. */
function numberList(value: string): Array<number | string> | undefined {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length === 0) return undefined;
  return parts.map((part) =>
    Number.isFinite(Number(part)) ? Number(part) : part,
  );
}

function compileItem(item: ItemDraft, isImageRequired: boolean) {
  const hasImage = item.imageUrl !== "";
  const alt = localizedText(item.imageAlt);
  const audio = localizedAudio(item.audio);
  return {
    id: item.id,
    label: localizedText(item.label),
    ...(audio === undefined ? {} : { audio }),
    // A required-but-empty image keeps its key so the schema reports the missing
    // URL against the field the author can see, rather than against an object with
    // no `image` at all.
    ...(hasImage || isImageRequired
      ? {
          image: {
            kind: "image",
            url: item.imageUrl,
            ...(Object.keys(alt).length > 0 ? { alt } : {}),
          },
        }
      : {}),
  };
}

/** The grid cells a puzzle of this size has, in reading order. */
export function puzzleSlots(rows: number, cols: number): PuzzleSlot[] {
  return Array.from({ length: rows * cols }, (_unused, index) => ({
    index,
    row: Math.floor(index / cols),
    col: index % cols,
  }));
}

/** The draft as a payload, ready for `safeParseActivityDefinition`. */
export function compileActivity(draft: ActivityDraft): unknown {
  const audio = localizedAudio(draft.instructionAudio);
  const shared = {
    schemaVersion: 1,
    type: draft.type,
    ...(audio === undefined ? {} : { instructionAudio: audio }),
  };

  if (draft.type === "trace") {
    const strokeOrder = numberList(draft.strokeOrder);
    const tolerance = draft.tolerance.trim();
    return {
      ...shared,
      glyph: draft.glyph,
      pathData: draft.pathData,
      guideDots: draft.guideDots,
      ...(strokeOrder === undefined ? {} : { strokeOrder }),
      ...(tolerance === "" ? {} : { tolerance: Number(tolerance) }),
    };
  }

  if (draft.type === "puzzle") {
    const alt = localizedText(draft.imageAlt);
    const prePlaced = numberList(draft.prePlaced);
    return {
      ...shared,
      image: {
        kind: "image",
        url: draft.imageUrl,
        ...(Object.keys(alt).length > 0 ? { alt } : {}),
      },
      grid: { rows: draft.rows, cols: draft.cols },
      slots: puzzleSlots(draft.rows, draft.cols),
      ...(prePlaced === undefined ? {} : { prePlaced }),
    };
  }

  if (draft.type === "match") {
    return {
      ...shared,
      leftSet: draft.items.map((item) => compileItem(item, false)),
      rightSet: draft.targets.map((item) => compileItem(item, false)),
      pairs: pairsFrom(draft),
    };
  }

  return {
    ...shared,
    items: draft.items.map((item) => compileItem(item, false)),
    // A drop zone always shows an image: a pre-reader cannot rely on the label.
    targets: draft.targets.map((item) => compileItem(item, true)),
    correctMappings: draft.items
      .filter((item) => draft.mapping[item.id] !== undefined)
      .map((item) => ({
        itemId: item.id,
        targetId: draft.mapping[item.id],
      })),
  };
}

function pairsFrom(draft: ActivityDraft) {
  return draft.items
    .filter((item) => draft.mapping[item.id] !== undefined)
    .map((item) => ({ leftId: item.id, rightId: draft.mapping[item.id] }));
}

/** Every path the form renders an input for — see `toIssueMap`'s `knownPaths`. */
export function knownActivityPaths(draft: ActivityDraft): string[] {
  const setPaths = (field: string, items: ItemDraft[]) =>
    items.flatMap((_item, index) => [
      `${field}.${index}`,
      `${field}.${index}.id`,
      `${field}.${index}.image`,
      `${field}.${index}.image.url`,
      `${field}.${index}.label`,
      ...LOCALES.map((locale) => `${field}.${index}.label.${locale}`),
      `${field}.${index}.image.alt`,
      ...LOCALES.map((locale) => `${field}.${index}.image.alt.${locale}`),
      `${field}.${index}.audio`,
      ...LOCALES.flatMap((locale) => [
        `${field}.${index}.audio.${locale}`,
        `${field}.${index}.audio.${locale}.url`,
      ]),
    ]);

  const base = [
    "type",
    "schemaVersion",
    "instructionAudio",
    ...LOCALES.flatMap((locale) => [
      `instructionAudio.${locale}`,
      `instructionAudio.${locale}.url`,
    ]),
  ];

  if (draft.type === "trace") {
    return [
      ...base,
      "glyph",
      "pathData",
      "guideDots",
      "strokeOrder",
      "tolerance",
    ];
  }
  if (draft.type === "puzzle") {
    return [
      ...base,
      "image",
      "image.url",
      "image.alt",
      ...LOCALES.map((locale) => `image.alt.${locale}`),
      "grid",
      "grid.rows",
      "grid.cols",
      "prePlaced",
    ];
  }
  if (draft.type === "match") {
    return [
      ...base,
      ...setPaths("leftSet", draft.items),
      ...setPaths("rightSet", draft.targets),
    ];
  }
  return [
    ...base,
    ...setPaths("items", draft.items),
    ...setPaths("targets", draft.targets),
  ];
}

export function draftFromActivity(
  definition: ActivityDefinition,
): ActivityDraft {
  const base: ActivityDraft = {
    ...emptyActivityDraft(definition.type),
    instructionAudio: {
      en: definition.instructionAudio.en.url,
      bn: definition.instructionAudio.bn.url,
    },
  };

  if (definition.type === "trace") {
    return {
      ...base,
      glyph: definition.glyph,
      pathData: definition.pathData,
      guideDots: definition.guideDots.map((dot) => ({ x: dot.x, y: dot.y })),
      strokeOrder: definition.strokeOrder?.join(", ") ?? "",
      tolerance:
        definition.tolerance === undefined ? "" : String(definition.tolerance),
    };
  }

  if (definition.type === "puzzle") {
    return {
      ...base,
      imageUrl: definition.image.url,
      imageAlt: {
        en: definition.image.alt?.en ?? "",
        bn: definition.image.alt?.bn ?? "",
      },
      rows: definition.grid.rows,
      cols: definition.grid.cols,
      prePlaced: definition.prePlaced?.join(", ") ?? "",
    };
  }

  if (definition.type === "match") {
    return {
      ...base,
      items: definition.leftSet.map(toItemDraft),
      targets: definition.rightSet.map(toItemDraft),
      mapping: Object.fromEntries(
        definition.pairs.map((pair) => [pair.leftId, pair.rightId]),
      ),
    };
  }

  return {
    ...base,
    items: definition.items.map(toItemDraft),
    targets: definition.targets.map(toItemDraft),
    mapping: Object.fromEntries(
      definition.correctMappings.map((one) => [one.itemId, one.targetId]),
    ),
  };
}

function toItemDraft(item: {
  id: string;
  label: { en: string; bn: string };
  image?: { url: string; alt?: { en: string; bn: string } };
  audio?: { en: { url: string }; bn: { url: string } };
}): ItemDraft {
  return {
    id: item.id,
    label: { en: item.label.en, bn: item.label.bn },
    imageUrl: item.image?.url ?? "",
    imageAlt: {
      en: item.image?.alt?.en ?? "",
      bn: item.image?.alt?.bn ?? "",
    },
    audio: {
      en: item.audio?.en.url ?? "",
      bn: item.audio?.bn.url ?? "",
    },
  };
}
