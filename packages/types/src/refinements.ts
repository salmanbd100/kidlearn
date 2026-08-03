/**
 * Cross-field refinement helpers shared by the activity and quiz schemas.
 *
 * Zod validates fields in isolation; these helpers cover the referential rules
 * that only make sense once the whole payload is present — "this id points at
 * something that exists", "no id is reused". Internal to the package: not
 * re-exported from `src/index.ts`.
 */
import { z } from "zod";

/** The minimum shape these helpers need — deliberately structural, not tied to a schema. */
type Identified = { id: string };

/** An option that must carry at least something renderable. */
type Renderable = { id: string; text?: unknown; image?: unknown };

type Pair = { leftId: string; rightId: string };

function addIssue(
  ctx: z.RefinementCtx,
  path: (string | number)[],
  message: string,
): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

/** Flags any id appearing more than once in a list. */
export function addDuplicateIdIssues(
  ctx: z.RefinementCtx,
  items: readonly Identified[],
  field: string,
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      addIssue(ctx, [field, index, "id"], `duplicate id "${item.id}"`);
    }
    seen.add(item.id);
  });
}

/**
 * Validates a two-column pairing (match activity, match_pair question):
 * every referenced id exists, and no id on either side is used twice.
 */
export function addPairingIssues(
  ctx: z.RefinementCtx,
  left: readonly Identified[],
  right: readonly Identified[],
  pairs: readonly Pair[],
  field: string,
): void {
  const leftIds = new Set(left.map((item) => item.id));
  const rightIds = new Set(right.map((item) => item.id));
  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();

  pairs.forEach((pair, index) => {
    if (!leftIds.has(pair.leftId)) {
      addIssue(
        ctx,
        [field, index, "leftId"],
        `unknown left id "${pair.leftId}"`,
      );
    } else if (usedLeft.has(pair.leftId)) {
      addIssue(
        ctx,
        [field, index, "leftId"],
        `left id "${pair.leftId}" is used more than once`,
      );
    }
    usedLeft.add(pair.leftId);

    if (!rightIds.has(pair.rightId)) {
      addIssue(
        ctx,
        [field, index, "rightId"],
        `unknown right id "${pair.rightId}"`,
      );
    } else if (usedRight.has(pair.rightId)) {
      addIssue(
        ctx,
        [field, index, "rightId"],
        `right id "${pair.rightId}" is used more than once`,
      );
    }
    usedRight.add(pair.rightId);
  });
}

/**
 * Validates a single-answer option list (mcq, drag_answer, picture_select):
 * unique ids, the correct answer resolves, and every option renders as
 * something a pre-reader can perceive.
 */
export function addAnswerOptionIssues(
  ctx: z.RefinementCtx,
  options: readonly Renderable[],
  correctOptionId: string,
): void {
  addDuplicateIdIssues(ctx, options, "options");

  if (!options.some((option) => option.id === correctOptionId)) {
    addIssue(ctx, ["correctOptionId"], "correctOptionId not found in options");
  }

  options.forEach((option, index) => {
    if (option.text === undefined && option.image === undefined) {
      addIssue(ctx, ["options", index], "each option needs text or image");
    }
  });
}

/**
 * Every child-facing locale of a fill-in-the-blank sentence must carry exactly
 * one `{blank}` token — zero leaves nothing to drop into, two is ambiguous.
 */
export function addSingleBlankTokenIssues(
  ctx: z.RefinementCtx,
  sentence: Record<string, string>,
  field: string,
): void {
  for (const [locale, text] of Object.entries(sentence)) {
    const blankCount = (text.match(/\{blank\}/g) ?? []).length;
    if (blankCount !== 1) {
      addIssue(
        ctx,
        [field, locale],
        `sentence must contain exactly one {blank} token, found ${blankCount}`,
      );
    }
  }
}
