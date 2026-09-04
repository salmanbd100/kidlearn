"use client";

import type {
  ActivityItem,
  ImageAssetRef,
  Locale,
  MatchActivity as MatchDefinition,
} from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { Check } from "lucide-react";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { evaluatePair } from "./evaluate";
import { pairCardClass, pairLineClass } from "./pair-colours";
import type { ActivityRendererProps } from "./registry";
import { type PairSide, usePairing } from "./use-pairing";
import { isWiggling, useWiggle } from "./use-wiggle";

// Find the two that go together (FR-ACT-03).

const matchCardVariants = cva(
  // 96px square before its contents — the floor this spec sets for a match card,
  // half again the 64px kid minimum, because two of these are tapped in sequence.
  "flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-4 p-2 text-card-foreground transition-transform [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      state: {
        idle: "border-border bg-card shadow-md",
        selected: "border-primary bg-card shadow-pop motion-safe:scale-105",
        // The pair hue arrives as a second class from `pairCardClass`.
        matched: "shadow-sm",
      },
    },
    defaultVariants: { state: "idle" },
  },
);

const IMAGE_PX = 96;

/** Under-stroke and pair-coloured stroke, in px. */
const LINE_EDGE_WIDTH = 8;
const LINE_WIDTH = 4;

interface PairLine {
  id: string;
  pairIndex: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function centreWithin(box: DOMRect, origin: DOMRect): { x: number; y: number } {
  return {
    x: box.left + box.width / 2 - origin.left,
    y: box.top + box.height / 2 - origin.top,
  };
}

export function MatchActivity({
  definition,
  locale,
  feedback,
  onActivityComplete,
}: ActivityRendererProps<MatchDefinition>) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const { play } = useAudio();
  const instructionsId = useId();
  const { wiggle, requestWiggle } = useWiggle();

  const isCorrectPair = useCallback(
    (leftId: string, rightId: string) =>
      evaluatePair(definition, leftId, rightId),
    [definition],
  );

  const handleCorrect = useCallback(() => feedback.success(), [feedback]);

  const handleWrong = useCallback(
    (leftId: string, rightId: string) => {
      feedback.retry();
      requestWiggle([leftId, rightId]);
    },
    [feedback, requestWiggle],
  );

  const { selected, matched, isLocked, pairIndexOf, tap } = usePairing({
    isCorrectPair,
    onCorrect: handleCorrect,
    onWrong: handleWrong,
    onAllMatched: onActivityComplete,
    totalPairs: definition.pairs.length,
  });

  const itemById = useMemo(
    () =>
      new Map(
        [...definition.leftSet, ...definition.rightSet].map((item) => [
          item.id,
          item,
        ]),
      ),
    [definition],
  );

  const boardRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<readonly PairLine[]>([]);

  const registerCard = useCallback((id: string, node: HTMLElement | null) => {
    if (node === null) cardRefs.current.delete(id);
    else cardRefs.current.set(id, node);
  }, []);

  const measureLines = useCallback(() => {
    const board = boardRef.current;
    if (board === null) return;

    const origin = board.getBoundingClientRect();
    const next: PairLine[] = [];
    let pairIndex = 0;

    for (const [leftId, rightId] of matched) {
      const from = cardRefs.current.get(leftId);
      const to = cardRefs.current.get(rightId);
      if (from !== undefined && to !== undefined) {
        const a = centreWithin(from.getBoundingClientRect(), origin);
        const b = centreWithin(to.getBoundingClientRect(), origin);
        next.push({
          id: `${leftId}-${rightId}`,
          pairIndex,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
        });
      }
      pairIndex += 1;
    }

    setLines(next);
  }, [matched]);

  useEffect(() => {
    measureLines();

    const board = boardRef.current;
    if (board === null) return;
    const observer = new ResizeObserver(measureLines);
    observer.observe(board);
    return () => observer.disconnect();
  }, [measureLines]);

  const handleTap = useCallback(
    (side: PairSide, item: ActivityItem) => {
      // The card's own voice, when the payload gives it one: for a pre-reader
      // matching a word to a picture, hearing the word is the whole exercise.
      const clip = item.audio?.[locale].url;
      if (clip !== undefined) void play(clip, { interrupt: true });
      tap(side, item.id);
    },
    [locale, play, tap],
  );

  const selectedLabel =
    selected === undefined
      ? undefined
      : itemById.get(selected.id)?.label[locale];

  const sets: readonly {
    side: PairSide;
    label: string;
    items: readonly ActivityItem[];
  }[] = [
    {
      side: "left",
      label: t("activity.match.firstSet"),
      items: definition.leftSet,
    },
    {
      side: "right",
      label: t("activity.match.secondSet"),
      items: definition.rightSet,
    },
  ];

  return (
    <div
      data-testid="activity-match"
      className="flex min-h-0 flex-1 items-center justify-center overflow-auto"
    >
      {/*
        One line of narration, not a live region on the board: the thing that
        changed is either "you have picked this card" or "that is another pair
        done", and re-reading twelve card labels after every tap says neither
        (FR-I18N-01).
      */}
      <span role="status" className="sr-only">
        {matched.size === definition.pairs.length
          ? t("activity.match.done")
          : selectedLabel !== undefined
            ? t("activity.match.picked", { item: selectedLabel })
            : t("activity.match.progress", {
                matched: matched.size,
                total: definition.pairs.length,
              })}
      </span>

      <span id={instructionsId} className="sr-only">
        {t("activity.match.keyboard")}
      </span>

      {/*
        Two columns with a phone held upright, two rows with it held sideways —
        the line between a pair then runs across the short axis either way, so it
        stays short enough to follow (design.md §6).
      */}
      <div
        ref={boardRef}
        className="relative flex gap-8 p-2 landscape:flex-col landscape:gap-6"
      >
        {/*
          Two labelled lists and no wrapper landmark: the board is two sets of
          cards, which is what a list of each says, and how many are in each is the
          sighted child's "two pairs left" made audible. The keyboard hint hangs off
          both, because either one can be entered first.
        */}
        {sets.map((set) => (
          <ul
            key={set.side}
            aria-label={set.label}
            aria-describedby={instructionsId}
            className="flex flex-col items-center gap-4 landscape:flex-row landscape:justify-center"
          >
            {set.items.map((item) => (
              <li key={item.id} className="flex">
                <MatchCard
                  item={item}
                  locale={locale}
                  isSelected={selected?.id === item.id}
                  pairIndex={pairIndexOf(item.id)}
                  isMatched={isLocked(item.id)}
                  matchedLabel={t("activity.match.cardMatched")}
                  isShaking={isWiggling(wiggle, item.id)}
                  shakeKey={wiggle?.count ?? 0}
                  registerCard={registerCard}
                  onTap={() => handleTap(set.side, item)}
                />
              </li>
            ))}
          </ul>
        ))}

        {/*
          No viewBox, so one SVG user unit is one CSS pixel and the measured
          centres can be used as written. Behind nothing and on top of nothing
          that is tappable — `pointer-events-none` keeps every card underneath it
          reachable by a finger that lands on a line.
        */}
        <svg
          aria-hidden="true"
          data-testid="match-lines"
          className="pointer-events-none absolute inset-0 size-full"
        >
          {lines.map((line) => (
            <g key={line.id} data-testid="match-line" strokeLinecap="round">
              {/*
                The hue on its own is 1.5–2.3:1 against cream on the playful end
                of the palette, under the 3:1 floor for a graphic that carries
                meaning. The dark under-stroke is what actually clears it, in
                every theme including high-contrast (design.md §2.3).
              */}
              <line
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                className="stroke-foreground/70"
                strokeWidth={LINE_EDGE_WIDTH}
              />
              <line
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                className={pairLineClass(line.pairIndex)}
                strokeWidth={LINE_WIDTH}
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function MatchCard({
  item,
  locale,
  isSelected,
  isMatched,
  matchedLabel,
  pairIndex,
  isShaking,
  shakeKey,
  registerCard,
  onTap,
}: {
  item: ActivityItem;
  locale: Locale;
  isSelected: boolean;
  isMatched: boolean;
  matchedLabel: string;
  pairIndex: number | undefined;
  isShaking: boolean;
  shakeKey: number;
  registerCard: (id: string, node: HTMLElement | null) => void;
  onTap: () => void;
}) {
  const state = isMatched ? "matched" : isSelected ? "selected" : "idle";

  return (
    <button
      ref={(node) => registerCard(item.id, node)}
      type="button"
      data-testid={`match-card-${item.id}`}
      data-state={state}
      // `aria-disabled` rather than `disabled`: a matched card is still part of
      // the board a screen-reader user is reading back, and a disabled button
      // drops out of the tab order mid-activity.
      aria-disabled={isMatched}
      aria-pressed={isSelected}
      className={cn(
        matchCardVariants({ state }),
        isMatched && pairIndex !== undefined && pairCardClass(pairIndex),
      )}
      onClick={onTap}
    >
      {/*
        Keyed on the shake count, not on whether one is running: re-applying an
        animation class that is already applied restarts nothing, and the second
        wrong guess of the same pair is the attempt that most needs the answer.
      */}
      <span
        key={shakeKey}
        className={cn(
          "flex flex-col items-center justify-center gap-1",
          isShaking && "motion-safe:animate-wiggle",
        )}
      >
        <CardArt image={item.image} locale={locale} />
        <span className="font-display text-lg leading-tight">
          {item.label[locale]}
        </span>
      </span>

      {/*
        Shape as well as colour: the tick is what tells a colour-blind child that
        this card is finished, without having to tell one hue from another
        (design.md §2.3). The pair hues are decorative and deliberately survive
        the high-contrast theme — the ink on the card is `card-foreground` over a
        15% wash, so the text contrast the theme guarantees is untouched.
      */}
      {isMatched ? (
        <Check aria-hidden="true" className="size-4 text-success" />
      ) : null}
      {isMatched ? <span className="sr-only">{matchedLabel}</span> : null}
    </button>
  );
}

/**
 * `alt=""`: every card shows its label as text as well, so the picture repeats
 * what is already announced rather than adding to it (design.md §7).
 */
function CardArt({
  image,
  locale,
}: {
  image: ImageAssetRef | undefined;
  locale: Locale;
}) {
  if (image === undefined) return null;

  return (
    <Image
      src={image.url}
      alt=""
      title={image.alt?.[locale]}
      width={IMAGE_PX}
      height={IMAGE_PX}
      className="size-10 w-auto object-contain"
    />
  );
}
