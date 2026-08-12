/**
 * Canonical quiz question payloads. Same conventions as `./activities`:
 * `valid*` fixtures are type-annotated so the compiler checks them, `invalid*`
 * fixtures are `unknown` because being structurally wrong is the point.
 */
import type { ImageAssetRef, LocalizedAudio } from "../primitives.js";
import type {
  DragAnswerQuestion,
  MatchPairQuestion,
  McqQuestion,
  PictureSelectQuestion,
} from "../quiz/schemas.js";

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

export const validMcq: McqQuestion = {
  schemaVersion: 1,
  type: "mcq",
  prompt: { en: "Which one is red?", bn: "কোনটি লাল?" },
  promptAudio: audio("which-one-is-red"),
  options: [
    {
      id: "apple",
      text: { en: "Apple", bn: "আপেল" },
      image: image("apple", "A red apple", "একটি লাল আপেল"),
    },
    {
      id: "leaf",
      text: { en: "Leaf", bn: "পাতা" },
      image: image("leaf", "A green leaf", "একটি সবুজ পাতা"),
    },
    {
      id: "sky",
      text: { en: "Sky", bn: "আকাশ" },
      image: image("sky", "A blue sky", "নীল আকাশ"),
    },
  ],
  correctOptionId: "apple",
};

/** The answer key names an option that is not on screen. */
export const invalidMcqBadCorrectId: unknown = {
  ...validMcq,
  correctOptionId: "banana",
};

/** Two options is below the FR-QUIZ-01 floor of three. */
export const invalidMcqTooFewOptions: unknown = {
  ...validMcq,
  options: validMcq.options.slice(0, 2),
};

/** A missing `bn` prompt would ship an untranslated question to a Bangla learner. */
export const invalidMcqMissingBanglaPrompt: unknown = {
  ...validMcq,
  prompt: { en: "Which one is red?" },
};

export const invalidMcqWrongVersion: unknown = {
  ...validMcq,
  schemaVersion: 2,
};

export const validMatchPair: MatchPairQuestion = {
  schemaVersion: 1,
  type: "match_pair",
  prompt: {
    en: "Match each animal to its sound.",
    bn: "প্রতিটি প্রাণীকে তার ডাকের সাথে মেলাও।",
  },
  promptAudio: audio("match-animal-to-sound"),
  leftColumn: [
    {
      id: "dog",
      text: { en: "Dog", bn: "কুকুর" },
      image: image("dog", "A dog", "একটি কুকুর"),
    },
    {
      id: "cat",
      text: { en: "Cat", bn: "বিড়াল" },
      image: image("cat", "A cat", "একটি বিড়াল"),
    },
  ],
  rightColumn: [
    { id: "woof", text: { en: "Woof", bn: "ভউ" }, audio: audio("woof") },
    { id: "meow", text: { en: "Meow", bn: "মিঁয়াও" }, audio: audio("meow") },
  ],
  correctPairs: [
    { leftId: "dog", rightId: "woof" },
    { leftId: "cat", rightId: "meow" },
  ],
};

export const invalidMatchPairUnknownRightId: unknown = {
  ...validMatchPair,
  correctPairs: [{ leftId: "dog", rightId: "moo" }],
};

export const invalidMatchPairReusedLeftId: unknown = {
  ...validMatchPair,
  correctPairs: [
    { leftId: "dog", rightId: "woof" },
    { leftId: "dog", rightId: "meow" },
  ],
};

/** `cat` has no correct sound, so the question cannot be answered fully. */
export const invalidMatchPairUnpairedLeftOption: unknown = {
  ...validMatchPair,
  correctPairs: [{ leftId: "dog", rightId: "woof" }],
};

export const validDragAnswer: DragAnswerQuestion = {
  schemaVersion: 1,
  type: "drag_answer",
  prompt: { en: "Finish the sentence.", bn: "বাক্যটি সম্পূর্ণ করো।" },
  promptAudio: audio("finish-the-sentence"),
  sentence: { en: "The sky is {blank}.", bn: "আকাশ {blank}।" },
  options: [
    { id: "blue", text: { en: "blue", bn: "নীল" } },
    { id: "green", text: { en: "green", bn: "সবুজ" } },
  ],
  correctOptionId: "blue",
};

/** No `{blank}` in the Bangla sentence — nowhere to drop the answer. */
export const invalidDragAnswerMissingBlank: unknown = {
  ...validDragAnswer,
  sentence: { en: "The sky is {blank}.", bn: "আকাশ নীল।" },
};

/** Two blanks make the single `correctOptionId` ambiguous. */
export const invalidDragAnswerTwoBlanks: unknown = {
  ...validDragAnswer,
  sentence: { en: "The {blank} is {blank}.", bn: "আকাশ {blank}।" },
};

export const validPictureSelect: PictureSelectQuestion = {
  schemaVersion: 1,
  type: "picture_select",
  prompt: { en: "Tap the triangle.", bn: "ত্রিভুজে টোকা দাও।" },
  promptAudio: audio("tap-the-triangle"),
  options: [
    { id: "triangle", image: image("triangle", "A triangle", "একটি ত্রিভুজ") },
    { id: "circle", image: image("circle", "A circle", "একটি বৃত্ত") },
    { id: "square", image: image("square", "A square", "একটি বর্গক্ষেত্র") },
  ],
  correctOptionId: "triangle",
};

/** Text-only options defeat the point of a picture-select question. */
export const invalidPictureSelectMissingImage: unknown = {
  ...validPictureSelect,
  options: [
    { id: "triangle", text: { en: "Triangle", bn: "ত্রিভুজ" } },
    { id: "circle", image: image("circle", "A circle", "একটি বৃত্ত") },
    { id: "square", image: image("square", "A square", "একটি বর্গক্ষেত্র") },
  ],
};

export const invalidPictureSelectBadCorrectId: unknown = {
  ...validPictureSelect,
  correctOptionId: "hexagon",
};

/** A `type` no quiz renderer implements. */
export const invalidQuizUnknownType: unknown = {
  schemaVersion: 1,
  type: "essay",
};
