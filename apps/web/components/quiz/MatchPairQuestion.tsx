"use client";

import type {
  ImageAssetRef,
  Locale,
  MatchPairQuestion as MatchPairDefinition,
  QuizOption,
} from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { Check } from "lucide-react";
import Image from "next/image";
import { useCallback, useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { pairCardClass } from "@/components/activities/pair-colours";
import { randomCheerAudioUrl } from "@/components/activities/use-activity-feedback";
import { type PairSide, usePairing } from "@/components/activities/use-pairing";
import { isWiggling, useWiggle } from "@/components/activities/use-wiggle";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import type { QuestionProps, QuizAnswerValue } from "./types";

/**
 * Match each one to its partner (FR-QUIZ-02).
 *
 * **The interaction is the match activity's, not a copy of it.** `usePairing`
 * was written activity-agnostic in file 20 for exactly this: tap one, tap its
 * partner, wrong clears the selection and nothing is ever taken away. What
 * changes here is only who is keeping score.
 *
 * **A pair that goes together is confirmed but does not interrupt.** The cheer
 * is played straight from the shared pool rather than through
 * `feedback.correct`, because that method's job is the 1.2-second hold before a
 * commit — and mid-question there is nothing to commit. Putting a lock after
 * every pair would leave a child tapping into a dead board for a second at a
 * time. The channel is used as intended at the end, where there *is* something
 * to advance to.
 *
 * **One answer, at the end.** Pairs matched along the way are the child's
 * working, not attempts: a clean run reports a single correct attempt, and each
 * wrong pair adds one. That is what makes `attempts: 1, isCorrect: true` mean
 * "knew it" here as it does on a four-option question.
 */

const matchCardVariants = cva(
  // 96px square before its contents — the same floor the match activity sets,
  // half again the 64px kid minimum, because two are tapped in sequence.
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
   * Every pair matched is a correct pair, and `usePairing` only reports all-done
   * once there are as many of them as the payload declares — so the finished
   * board *is* `correctPairs`. Reading it from there rather than from the hook's
   * map avoids the one stale value in this file: `onAllMatched` fires from
   * inside the same tap that adds the last pair, before the state carrying it
   * has been committed.
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
      // The pair just tried, not the pairs already matched: the engine reads
      // only the flag, and this is both the truthful thing to name and the one
      // that is never an empty set.
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
      // Locked means the last pair's feedback is still playing. Ignoring taps
      // here is what makes a drumming child harmless — a tap landing during the
      // closing cheer would otherwise answer the next question.
      if (feedback.isLocked) return;

      // The card's own voice, where the payload gives it one: matching a word to
      // a sound is the whole exercise when the right-hand column is sounds.
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
        One line of narration rather than a live region on the board: what
        changed is either "you have picked this card" or "that is another pair
        done", and re-reading every card label after each tap says neither
        (FR-I18N-01).
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
        Two columns with a phone held upright, two rows with it held sideways, so
        a pair is always adjacent across the short axis (design.md §6).
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
  /** Names a wordless card the payload never described — see `alt` below. */
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
      // `aria-disabled` rather than `disabled`: a matched card is still part of
      // the board a screen-reader user is reading back, and a disabled button
      // drops out of the tab order mid-question.
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
        Shape as well as colour: the tick is what tells a colour-blind child that
        this card is finished, without having to tell one pastel from another
        (design.md §2.3).
      */}
      {isMatched ? (
        <>
          <Check aria-hidden="true" className="size-4 text-success" />
          <span className="sr-only">{matchedLabel}</span>
        </>
      ) : null}
    </button>
  );
}

/**
 * `alt=""` where the card also carries words, because the picture then repeats
 * what is already announced. A wordless card is the opposite case: `alt` is
 * optional on the schema, so an author may publish one with nothing describing
 * it, and an empty `alt` there would leave the button with no accessible name at
 * all — unreadable to a screen reader and unreachable by voice (design.md §7).
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
