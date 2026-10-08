import {
  QUIZ_QUESTION_SCHEMAS,
  safeParseQuizQuestion,
  validDragAnswer,
  validMatchPair,
  validMcq,
  validPictureSelect,
} from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import {
  compileQuestion,
  draftFromDefinition,
  emptyQuestionDraft,
  nextOption,
  type OptionDraft,
  type QuestionDraft,
} from "./quiz-draft";

function option(id: string, en: string, bn: string): OptionDraft {
  return {
    id,
    text: { en, bn },
    imageUrl: "",
    imageAlt: { en: "", bn: "" },
    audio: { en: "", bn: "" },
  };
}

function filledMcqDraft(): QuestionDraft {
  const draft = emptyQuestionDraft("mcq");
  return {
    ...draft,
    prompt: { en: "Which one is red?", bn: "কোনটি লাল?" },
    promptAudio: {
      en: "https://cdn.kidlearn.test/audio/en/red.mp3",
      bn: "https://cdn.kidlearn.test/audio/bn/red.mp3",
    },
    options: [
      option("apple", "Apple", "আপেল"),
      option("leaf", "Leaf", "পাতা"),
      option("sky", "Sky", "আকাশ"),
    ],
    correctOptionId: "apple",
  };
}

describe("compileQuestion", () => {
  it("produces an MCQ the shared schema accepts", () => {
    const parsed = safeParseQuizQuestion(compileQuestion(filledMcqDraft()));

    expect(parsed.success).toBe(true);
  });

  it("reports the missing locale when a Bangla prompt is removed", () => {
    // An untranslated question must report on the field, not the root, hence the member schema rather than the union.
    const draft = filledMcqDraft();
    draft.prompt.bn = "";

    const parsed = QUIZ_QUESTION_SCHEMAS.mcq.safeParse(compileQuestion(draft));

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const paths = parsed.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("prompt.bn");
  });

  it("reports the answer key when it names an option that is not there", () => {
    const draft = filledMcqDraft();
    draft.correctOptionId = "banana";

    const parsed = safeParseQuizQuestion(compileQuestion(draft));

    expect(parsed.success).toBe(false);
  });

  it("omits an empty optional image rather than sending an empty URL", () => {
    // `{ kind: "image", url: "" }` fails `HttpsUrlSchema`, so a picker left alone
    // would make an otherwise valid MCQ unsavable.
    const compiled = compileQuestion(filledMcqDraft()) as {
      options: Array<Record<string, unknown>>;
    };

    expect(compiled.options[0]).not.toHaveProperty("image");
  });

  it("keeps a required-but-empty image so the message lands on the field", () => {
    // Picture-first: emitting the key with an empty URL puts the issue at `options.0.image.url`.
    const draft = { ...filledMcqDraft(), format: "picture_select" as const };
    const compiled = compileQuestion(draft) as {
      options: Array<{ image?: { url: string } }>;
    };

    expect(compiled.options[0].image).toEqual({ kind: "image", url: "" });
  });

  it("omits audio only when neither locale is chosen", () => {
    const draft = filledMcqDraft();
    draft.promptAudio.en = "";
    draft.promptAudio.bn = "";

    const compiled = compileQuestion(draft) as Record<string, unknown>;

    expect(compiled).not.toHaveProperty("promptAudio");
  });

  it("keeps a half-filled audio pair so the schema names the missing locale", () => {
    // Dropping the pair would silently discard the picked clip with Save enabled; the half lands at `promptAudio.bn`.
    const draft = filledMcqDraft();
    draft.promptAudio.bn = "";

    const compiled = compileQuestion(draft) as Record<string, unknown>;

    expect(compiled.promptAudio).toEqual({
      en: { kind: "audio", url: draft.promptAudio.en },
    });
    expect(safeParseQuizQuestion(compiled).success).toBe(false);
  });

  it("numbers a new right-column option past the left column", () => {
    // The right column starts where the left ends; numbering by its own length reminted an existing id.
    const draft = emptyQuestionDraft("match_pair");

    const added = nextOption(draft.rightColumn, draft.leftColumn.length);

    expect(draft.rightColumn.map((option) => option.id)).not.toContain(
      added.id,
    );
  });

  it("skips an id that is still taken after an option was removed", () => {
    const draft = emptyQuestionDraft("match_pair");
    const shortened = draft.rightColumn.slice(0, 1);

    const added = nextOption(shortened, draft.leftColumn.length);

    expect(shortened.map((option) => option.id)).not.toContain(added.id);
  });

  it("builds match pairs from the per-left-option choices", () => {
    const draft = emptyQuestionDraft("match_pair");
    draft.pairing = { [draft.leftColumn[0].id]: draft.rightColumn[1].id };

    const compiled = compileQuestion(draft) as {
      correctPairs: Array<{ leftId: string; rightId: string }>;
    };

    expect(compiled.correctPairs).toEqual([
      { leftId: draft.leftColumn[0].id, rightId: draft.rightColumn[1].id },
    ]);
  });
});

describe("draftFromDefinition", () => {
  it.each([
    ["mcq", validMcq],
    ["picture_select", validPictureSelect],
    ["match_pair", validMatchPair],
    ["drag_answer", validDragAnswer],
  ] as const)("round-trips a stored %s without losing anything", (_name, definition) => {
    // Load, change nothing, save: the payload that comes out has to be the one that
    // went in, or every edit of an untouched field would silently rewrite it.
    const recompiled = compileQuestion(draftFromDefinition(definition));
    const parsed = safeParseQuizQuestion(recompiled);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual(definition);
  });
});
