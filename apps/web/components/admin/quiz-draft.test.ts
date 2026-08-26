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

/**
 * What the quiz editor's form state compiles to (FR-CMS-03).
 *
 * Driven as a function rather than through the rendered form, because the property
 * under test is a property of the compiler: "these fields produce a payload the
 * shared schema accepts". The component's suite covers what an author *sees* when
 * it does not.
 *
 * Every assertion runs the real shared schemas — the same table the server picks
 * its validator from and the same union the renderer parses before a child sees it.
 * A stubbed validator here would make the whole file vacuous.
 */

function option(id: string, en: string, bn: string): OptionDraft {
  return {
    id,
    text: { en, bn },
    imageUrl: "",
    imageAlt: { en: "", bn: "" },
    audio: { en: "", bn: "" },
  };
}

/** A complete MCQ, as an author would have typed it in. */
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
    // The case FR-I18N-01 exists for: an untranslated question shipped to a Bangla
    // learner. The issue has to land on the field, not at the root, or the editor
    // has nowhere to put the message — which is exactly why the editor parses with
    // the member schema rather than the union, as here.
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
    // `picture_select` is picture-first, so the image is not optional. Emitting the
    // key with an empty URL is what puts the issue at `options.0.image.url` rather
    // than at `options.0`.
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
    // Dropping the pair would discard the clip the author just picked, silently
    // and with Save still enabled. Emitting the half puts the issue at
    // `promptAudio.bn`, which `knownQuestionPaths` renders against the field.
    const draft = filledMcqDraft();
    draft.promptAudio.bn = "";

    const compiled = compileQuestion(draft) as Record<string, unknown>;

    expect(compiled.promptAudio).toEqual({
      en: { kind: "audio", url: draft.promptAudio.en },
    });
    expect(safeParseQuizQuestion(compiled).success).toBe(false);
  });

  it("numbers a new right-column option past the left column", () => {
    // The right column starts where the left one ends, so numbering a new option
    // by its own length alone reminted an id the column already held — every Add
    // on that column produced a duplicate-id error the author had to fix by hand.
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
