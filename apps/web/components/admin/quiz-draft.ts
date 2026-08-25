import type {
  Locale,
  QuizQuestionDefinition,
  QuizQuestionType,
} from "@kidlearn/types";
import { LOCALES } from "@kidlearn/types";

/**
 * The quiz question editor's form state, and the compiler that turns it into a
 * payload (FR-CMS-03).
 *
 * **Pure, and separate from the component on purpose.** "The form produces a
 * payload `safeParseQuizQuestion` accepts" is the property the editor exists for,
 * and it is a property of a function — testable directly, without rendering a
 * single input. The component's job is to move strings in and out of this shape.
 *
 * **One draft type for all four formats**, rather than a discriminated union of
 * four. Switching format mid-edit is a normal authoring move — an author decides
 * a question reads better as pictures — and a union would throw away the prompt
 * and options they had already typed on every switch. The compiler reads only the
 * fields the chosen format needs, so the unused ones are carried harmlessly.
 *
 * **Empty means absent, never empty-string.** `"" `in a `LocalizedText` field is a
 * Zod failure (`min(1)`), which is right for a prompt the author must write, but
 * wrong for an *optional* option image: an empty picker must compile to a missing
 * key, not to `{ kind: "image", url: "" }`. `localizedText`, `localizedAudio` and
 * `compileOption` are where that distinction is made, once each.
 */

export type LocalizedDraft = Record<Locale, string>;

export interface OptionDraft {
  id: string;
  text: LocalizedDraft;
  /** A `MediaAsset` delivery URL, or empty for none. */
  imageUrl: string;
  /**
   * The image's alternative text, per locale.
   *
   * Carried in the draft even though the schema makes it optional, because an edit
   * that silently dropped it would turn a described picture into an undescribed one
   * — an accessibility regression nobody performed and nobody would see.
   */
  imageAlt: LocalizedDraft;
  /** Per-locale audio URLs, or empty for none. */
  audio: LocalizedDraft;
}

export interface QuestionDraft {
  format: QuizQuestionType;
  prompt: LocalizedDraft;
  promptAudio: LocalizedDraft;
  /** `drag_answer` only — carries exactly one `{blank}` token per locale. */
  sentence: LocalizedDraft;
  /** `mcq`, `picture_select`, `drag_answer`. */
  options: OptionDraft[];
  correctOptionId: string;
  /** `match_pair` only. */
  leftColumn: OptionDraft[];
  rightColumn: OptionDraft[];
  /** Left option id → right option id. One entry per left option, or empty. */
  pairing: Record<string, string>;
}

const emptyLocalized = (): LocalizedDraft => ({ en: "", bn: "" });

export function emptyOption(index: number): OptionDraft {
  return {
    id: `option-${index + 1}`,
    text: emptyLocalized(),
    imageUrl: "",
    imageAlt: emptyLocalized(),
    audio: emptyLocalized(),
  };
}

/** How many options each format needs before it can possibly validate. */
export const MINIMUM_OPTIONS: Record<QuizQuestionType, number> = {
  mcq: 3,
  picture_select: 3,
  drag_answer: 2,
  match_pair: 2,
};

export const MAXIMUM_OPTIONS: Record<QuizQuestionType, number> = {
  mcq: 4,
  picture_select: 4,
  drag_answer: 4,
  match_pair: 6,
};

export function emptyQuestionDraft(format: QuizQuestionType): QuestionDraft {
  const count = MINIMUM_OPTIONS[format];
  return {
    format,
    prompt: emptyLocalized(),
    promptAudio: emptyLocalized(),
    sentence: emptyLocalized(),
    options: Array.from({ length: count }, (_unused, index) =>
      emptyOption(index),
    ),
    correctOptionId: "",
    leftColumn: Array.from({ length: count }, (_unused, index) =>
      emptyOption(index),
    ),
    rightColumn: Array.from({ length: count }, (_unused, index) =>
      emptyOption(index + count),
    ),
    pairing: {},
  };
}

// --- Compiling ------------------------------------------------------------

/** A `LocalizedAudio` pair, present only when *both* locales are filled. */
function localizedAudio(urls: LocalizedDraft) {
  if (LOCALES.some((locale) => urls[locale] === "")) return undefined;
  return {
    en: { kind: "audio", url: urls.en },
    bn: { kind: "audio", url: urls.bn },
  };
}

/**
 * A `LocalizedText`, or `undefined` when *neither* locale is filled.
 *
 * A half-filled pair compiles to the half that exists, deliberately: the schema
 * then reports the missing locale rather than the field vanishing, which is the
 * message an author needs (FR-I18N-01).
 */
function localizedText(text: LocalizedDraft) {
  if (LOCALES.every((locale) => text[locale] === "")) return undefined;
  return omitEmpty({ en: text.en, bn: text.bn });
}

/** Drops keys whose value is the empty string, so Zod reports them as missing. */
function omitEmpty(pair: LocalizedDraft): Partial<LocalizedDraft> {
  return Object.fromEntries(
    LOCALES.filter((locale) => pair[locale] !== "").map((locale) => [
      locale,
      pair[locale],
    ]),
  );
}

function compileOption(option: OptionDraft, isImageRequired: boolean) {
  const alt = localizedText(option.imageAlt);
  const image =
    option.imageUrl === ""
      ? undefined
      : { kind: "image", url: option.imageUrl, ...(alt ? { alt } : {}) };
  return {
    id: option.id,
    ...(localizedText(option.text) === undefined
      ? {}
      : { text: localizedText(option.text) }),
    // `picture_select` requires the image, so the key is emitted even when empty
    // — otherwise the schema reports "image is required" against an object that
    // has no `image` key at all, and the message lands nowhere useful.
    ...(image === undefined
      ? isImageRequired
        ? { image: { kind: "image", url: "" } }
        : {}
      : { image }),
    ...(localizedAudio(option.audio) === undefined
      ? {}
      : { audio: localizedAudio(option.audio) }),
  };
}

/**
 * The draft as a payload, ready for `safeParseQuizQuestion`.
 *
 * Returns `unknown` rather than `QuizQuestionDefinition`: an incomplete draft is
 * not a valid definition and typing it as one would be a claim the compiler cannot
 * make. Validating the result is the caller's whole purpose.
 */
export function compileQuestion(draft: QuestionDraft): unknown {
  const shared = {
    schemaVersion: 1,
    type: draft.format,
    ...(localizedText(draft.prompt) === undefined
      ? {}
      : { prompt: localizedText(draft.prompt) }),
    ...(localizedAudio(draft.promptAudio) === undefined
      ? {}
      : { promptAudio: localizedAudio(draft.promptAudio) }),
  };

  if (draft.format === "match_pair") {
    return {
      ...shared,
      leftColumn: draft.leftColumn.map((option) =>
        compileOption(option, false),
      ),
      rightColumn: draft.rightColumn.map((option) =>
        compileOption(option, false),
      ),
      correctPairs: draft.leftColumn
        .filter((option) => draft.pairing[option.id] !== undefined)
        .map((option) => ({
          leftId: option.id,
          rightId: draft.pairing[option.id],
        })),
    };
  }

  return {
    ...shared,
    options: draft.options.map((option) =>
      compileOption(option, draft.format === "picture_select"),
    ),
    correctOptionId: draft.correctOptionId,
    ...(draft.format === "drag_answer"
      ? {
          ...(localizedText(draft.sentence) === undefined
            ? {}
            : { sentence: localizedText(draft.sentence) }),
        }
      : {}),
  };
}

/**
 * Every path the form renders an input for, so `toIssueMap` can tell a message
 * that has a home from one that does not.
 *
 * `promptAudio` is listed as the bare field rather than per locale: the two
 * pickers sit under one heading, and an issue at `promptAudio.bn.url` belongs to
 * that heading.
 */
export function knownQuestionPaths(draft: QuestionDraft): string[] {
  const optionPaths = (field: string, options: OptionDraft[]) =>
    options.flatMap((_option, index) => [
      `${field}.${index}`,
      `${field}.${index}.id`,
      `${field}.${index}.image`,
      `${field}.${index}.image.url`,
      ...LOCALES.map((locale) => `${field}.${index}.text.${locale}`),
      `${field}.${index}.text`,
      `${field}.${index}.image.alt`,
      ...LOCALES.map((locale) => `${field}.${index}.image.alt.${locale}`),
    ]);

  const base = [
    "type",
    "schemaVersion",
    "prompt",
    ...LOCALES.map((locale) => `prompt.${locale}`),
    "promptAudio",
    ...LOCALES.flatMap((locale) => [
      `promptAudio.${locale}`,
      `promptAudio.${locale}.url`,
    ]),
  ];

  if (draft.format === "match_pair") {
    return [
      ...base,
      ...optionPaths("leftColumn", draft.leftColumn),
      ...optionPaths("rightColumn", draft.rightColumn),
    ];
  }

  return [
    ...base,
    ...optionPaths("options", draft.options),
    "correctOptionId",
    ...(draft.format === "drag_answer"
      ? ["sentence", ...LOCALES.map((locale) => `sentence.${locale}`)]
      : []),
  ];
}

// --- Loading an existing question ----------------------------------------

/**
 * A stored definition back into form state, so editing starts from what is there
 * rather than from blank fields.
 *
 * Narrowed by `type` rather than cast: each branch reads only the fields its
 * format carries, which is what makes the round trip — load, change one field,
 * save — lossless.
 */
export function draftFromDefinition(
  definition: QuizQuestionDefinition,
): QuestionDraft {
  const base: QuestionDraft = {
    ...emptyQuestionDraft(definition.type),
    prompt: { en: definition.prompt.en, bn: definition.prompt.bn },
    promptAudio: {
      en: definition.promptAudio.en.url,
      bn: definition.promptAudio.bn.url,
    },
  };

  if (definition.type === "match_pair") {
    return {
      ...base,
      leftColumn: definition.leftColumn.map(toOptionDraft),
      rightColumn: definition.rightColumn.map(toOptionDraft),
      pairing: Object.fromEntries(
        definition.correctPairs.map((pair) => [pair.leftId, pair.rightId]),
      ),
    };
  }

  return {
    ...base,
    options: definition.options.map(toOptionDraft),
    correctOptionId: definition.correctOptionId,
    ...(definition.type === "drag_answer"
      ? {
          sentence: {
            en: definition.sentence.en,
            bn: definition.sentence.bn,
          },
        }
      : {}),
  };
}

function toOptionDraft(option: {
  id: string;
  text?: { en: string; bn: string };
  image?: { url: string; alt?: { en: string; bn: string } };
  audio?: { en: { url: string }; bn: { url: string } };
}): OptionDraft {
  return {
    id: option.id,
    text: { en: option.text?.en ?? "", bn: option.text?.bn ?? "" },
    imageUrl: option.image?.url ?? "",
    imageAlt: {
      en: option.image?.alt?.en ?? "",
      bn: option.image?.alt?.bn ?? "",
    },
    audio: {
      en: option.audio?.en.url ?? "",
      bn: option.audio?.bn.url ?? "",
    },
  };
}
