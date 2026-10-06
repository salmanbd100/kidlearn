"use client";

import { LESSON_NAMESPACE } from "@kidlearn/i18n";
import type {
  ImageAssetRef,
  Locale,
  MatchPairQuestion as MatchPairDefinition,
  QuizOption,
} from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import Image from "next/image";
import { useCallback, useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/shared/components/AudioProvider";
import { randomCheerAudioUrl } from "@/shared/components/kid/feedback-audio";
import { pairCardClass } from "@/shared/components/kid/pair-colours";
import { StatusMark } from "@/shared/components/kid/StatusMark";
import { type PairSide, usePairing } from "@/shared/hooks/use-pairing";
import { isWiggling, useWiggle } from "@/shared/hooks/use-wiggle";
import type { QuestionProps, QuizAnswerValue } from "./types";

const matchCardVariants = cva(
  // 96px square, as in the match activity: half again the 64px kid minimum, as two are tapped in
  // sequence.
  "relative flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-4 p-2 text-card-foreground transition-transform touch-manipulation focus-ring",
  {
    variants: {
      state: {
        idle: "border-border bg-card shadow-md",
        selected: "border-primary bg-card shadow-pop motion-safe:scale-105",
        matched: "shadow-sm",
      },
    },
    defaultVariants: { state: "idle" },
  },
);

const IMAGE_PX = 96;

export function MatchPairQuestion({
  definition,
  locale,
  feedback,
  onAttempt,
  onCommit,
}: QuestionProps<MatchPairDefinition>) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const { play } = useAudio();
  const instructionsId = useId();
  const { wiggle, requestWiggle } = useWiggle();

  const isCorrectPair = useCallback(
    (leftId: string, rightId: string) =>
      definition.correctPairs.some(
        (pair) => pair.leftId === leftId && pair.rightId === rightId,
      ),
    [definition],
  );

  /**
   * The finished board is `correctPairs`; read from there, not the hook's map, which is stale:
   * `onAllMatched` fires before the last pair's state commits.
   */
  const finalAnswer = useMemo<QuizAnswerValue>(
    () => ({
      pairs: definition.correctPairs.map((pair) => ({
        leftId: pair.leftId,
        rightId: pair.rightId,
      })),
    }),
    [definition],
  );

  const handleCorrect = useCallback(() => {
    void play(randomCheerAudioUrl(), { interrupt: true });
  }, [play]);

  const handleWrong = useCallback(
    (leftId: string, rightId: string) => {
      feedback.retry();
      requestWiggle([leftId, rightId]);
      // The pair just tried, not those already matched: the engine reads only the flag, and this
      // set is never empty.
      onAttempt({ pairs: [{ leftId, rightId }] }, false);
    },
    [feedback, requestWiggle, onAttempt],
  );

  const handleAllMatched = useCallback(() => {
    onAttempt(finalAnswer, true);
    feedback.correct(() => onCommit(finalAnswer));
  }, [feedback, finalAnswer, onAttempt, onCommit]);

  const { selected, matched, isLocked, pairIndexOf, tap } = usePairing({
    isCorrectPair,
    onCorrect: handleCorrect,
    onWrong: handleWrong,
    onAllMatched: handleAllMatched,
    totalPairs: definition.correctPairs.length,
  });

  const optionById = useMemo(
    () =>
      new Map(
        [...definition.leftColumn, ...definition.rightColumn].map((option) => [
          option.id,
          option,
        ]),
      ),
    [definition],
  );

  const handleTap = useCallback(
    (side: PairSide, option: QuizOption) => {
      // Locked while the last pair's feedback plays: a tap during the closing cheer would answer
      // the next question.
      if (feedback.isLocked) return;

      // Matching a word to a sound is the whole exercise when the right column is sounds.
      const clip = option.audio?.[locale].url;
      if (clip !== undefined) void play(clip, { interrupt: true });
      tap(side, option.id);
    },
    [feedback.isLocked, locale, play, tap],
  );

  const selectedLabel =
    selected === undefined
      ? undefined
      : optionById.get(selected.id)?.text?.[locale];

  const columns: readonly {
    side: PairSide;
    label: string;
    options: readonly QuizOption[];
  }[] = [
    {
      side: "left",
      label: t("quiz.match.firstSet"),
      options: definition.leftColumn,
    },
    {
      side: "right",
      label: t("quiz.match.secondSet"),
      options: definition.rightColumn,
    },
  ];

  return (
    <div
      data-testid="quiz-match-pair"
      className="flex min-h-0 flex-1 items-center justify-center overflow-auto"
    >
      {/*
        One line of narration rather than a live region: re-reading every card label after each tap
        helps no one (FR-I18N-01).
      */}
      <span role="status" className="sr-only">
        {matched.size === definition.correctPairs.length
          ? t("quiz.match.done")
          : selectedLabel !== undefined
            ? t("quiz.match.picked", { item: selectedLabel })
            : t("quiz.match.progress", {
                matched: matched.size,
                total: definition.correctPairs.length,
              })}
      </span>

      <span id={instructionsId} className="sr-only">
        {t("quiz.match.keyboard")}
      </span>

      {/*
        Two columns upright, two rows sideways, so a pair is always adjacent across the short axis
        (design.md §6).
      */}
      <div className="flex gap-8 p-2 landscape:flex-col landscape:gap-6">
        {columns.map((column) => (
          <ul
            key={column.side}
            aria-label={column.label}
            aria-describedby={instructionsId}
            className="flex flex-col items-center gap-4 landscape:flex-row landscape:justify-center"
          >
            {column.options.map((option, index) => (
              <li key={option.id} className="flex">
                <MatchCard
                  option={option}
                  locale={locale}
                  isSelected={selected?.id === option.id}
                  isMatched={isLocked(option.id)}
                  pairIndex={pairIndexOf(option.id)}
                  matchedLabel={t("quiz.match.cardMatched")}
                  fallbackLabel={t("quiz.optionPicture", {
                    number: index + 1,
                  })}
                  isShaking={isWiggling(wiggle, option.id)}
                  shakeKey={wiggle?.count ?? 0}
                  onTap={() => handleTap(column.side, option)}
                />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

function MatchCard({
  option,
  locale,
  isSelected,
  isMatched,
  pairIndex,
  matchedLabel,
  fallbackLabel,
  isShaking,
  shakeKey,
  onTap,
}: {
  option: QuizOption;
  locale: Locale;
  isSelected: boolean;
  isMatched: boolean;
  pairIndex: number | undefined;
  matchedLabel: string;
  fallbackLabel: string;
  isShaking: boolean;
  shakeKey: number;
  onTap: () => void;
}) {
  const state = isMatched ? "matched" : isSelected ? "selected" : "idle";
  const label = option.text?.[locale];

  return (
    <button
      type="button"
      data-testid={`quiz-pair-card-${option.id}`}
      data-state={state}
      // `aria-disabled`, not `disabled`: a disabled button drops out of the tab order mid-question.
      aria-disabled={isMatched}
      aria-pressed={isSelected}
      className={cn(
        matchCardVariants({ state }),
        isMatched && pairIndex !== undefined && pairCardClass(pairIndex),
      )}
      onClick={onTap}
    >
      {/*
        Keyed on the shake count: re-applying an already-applied animation class restarts nothing.
      */}
      <span
        key={shakeKey}
        className={cn(
          "flex flex-col items-center justify-center gap-1",
          isShaking && "motion-safe:animate-wiggle",
        )}
      >
        <CardArt
          image={option.image}
          locale={locale}
          hasLabel={label !== undefined}
          fallbackLabel={fallbackLabel}
        />
        {label === undefined ? null : (
          <span className="font-display text-lg leading-tight">{label}</span>
        )}
      </span>

      {/*
        Shape as well as colour: the tick tells a colour-blind child the card is finished (design.md
        §2.3).
      */}
      {isMatched ? (
        <>
          <StatusMark tone="done" />
          <span className="sr-only">{matchedLabel}</span>
        </>
      ) : null}
      {isShaking && !isMatched ? <StatusMark tone="retry" /> : null}
    </button>
  );
}

/**
 * `alt=""` where words are also shown. A wordless card needs a real `alt` (optional on the schema),
 * or it is unreadable to screen readers and voice control (design.md §7).
 */
function CardArt({
  image,
  locale,
  hasLabel,
  fallbackLabel,
}: {
  image: ImageAssetRef | undefined;
  locale: Locale;
  hasLabel: boolean;
  fallbackLabel: string;
}) {
  if (image === undefined) return null;

  return (
    <Image
      src={image.url}
      alt={hasLabel ? "" : (image.alt?.[locale] ?? fallbackLabel)}
      title={hasLabel ? image.alt?.[locale] : undefined}
      width={IMAGE_PX}
      height={IMAGE_PX}
      className="size-10 w-auto object-contain"
    />
  );
}
