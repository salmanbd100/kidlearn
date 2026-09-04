// The highlight a matched pair shares (FR-ACT-03).

const PAIR_CARD_CLASSES = [
  "border-pair-1 bg-pair-1/15",
  "border-pair-2 bg-pair-2/15",
  "border-pair-3 bg-pair-3/15",
  "border-pair-4 bg-pair-4/15",
  "border-pair-5 bg-pair-5/15",
  "border-pair-6 bg-pair-6/15",
] as const;

const PAIR_LINE_CLASSES = [
  "stroke-pair-1",
  "stroke-pair-2",
  "stroke-pair-3",
  "stroke-pair-4",
  "stroke-pair-5",
  "stroke-pair-6",
] as const;

export const PAIR_COLOUR_COUNT = PAIR_CARD_CLASSES.length;

export function pairCardClass(pairIndex: number): string {
  return PAIR_CARD_CLASSES[pairIndex % PAIR_COLOUR_COUNT];
}

export function pairLineClass(pairIndex: number): string {
  return PAIR_LINE_CLASSES[pairIndex % PAIR_COLOUR_COUNT];
}
