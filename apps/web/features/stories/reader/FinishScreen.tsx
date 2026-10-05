"use client";

import { LESSON_NAMESPACE, STUDENT_NAMESPACE } from "@kidlearn/i18n";
import type { StoryCompletionResponse } from "@kidlearn/types";
import { BookOpen, Coins, RotateCcw, Star } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/shared/components/AudioProvider";
import { BadgeReveal } from "@/shared/components/kid/BadgeReveal";
import { BigButton } from "@/shared/components/kid/BigButton";
import { unlockNames } from "@/shared/lib/unlock-names";

/** Narrower than `StoryCompletionResponse`: `streak` and `totals` are server running figures the reader has no honest value for on an unposted replay (`REPLAY_COMPLETION`). */
export type StoryFinishReward = Pick<
  StoryCompletionResponse,
  "granted" | "newBadges" | "newCharacters"
>;

export interface FinishScreenProps {
  moral: string | null;
  moralAudioUrl: string | null;
  completion: StoryFinishReward | undefined;
  onReadAgain: () => void;
  onMoreStories: () => void;
}

export function FinishScreen({
  moral,
  moralAudioUrl,
  completion,
  onReadAgain,
  onMoreStories,
}: FinishScreenProps) {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  // The unlock copy is the lesson celebration's, reused: a badge from reading and one from a lesson are the same event to a child.
  const { t: tLesson } = useTranslation(LESSON_NAMESPACE);
  const { play } = useAudio();

  useEffect(() => {
    if (moralAudioUrl === null) return;
    void play(moralAudioUrl, { interrupt: true });
  }, [play, moralAudioUrl]);

  const granted = completion?.granted ?? null;
  /** Nothing true to say about the reward yet. */
  const isRewardUnknown = completion === undefined;

  // A story can unlock a badge or character itself ("Reading Star"), so celebrate it here rather than at the next lesson.
  const newBadges = completion?.newBadges ?? [];
  const newCharacters = completion?.newCharacters ?? [];
  const unlockSentences = [
    newBadges.length === 0
      ? null
      : tLesson("reward.announce.badges", {
          names: unlockNames(tLesson, newBadges),
          count: newBadges.length,
        }),
    newCharacters.length === 0
      ? null
      : tLesson("reward.announce.characters", {
          names: unlockNames(tLesson, newCharacters),
          count: newCharacters.length,
        }),
  ].filter((line): line is string => line !== null);

  const rewardSentence = isRewardUnknown
    ? null
    : granted === null
      ? t("reader.finish.readAgainReward")
      : t("reader.finish.earned", {
          stars: t("rewards.stars", { count: granted.stars }),
          coins: t("rewards.coins", { count: granted.coins }),
        });

  return (
    <section
      data-testid="story-finish"
      className="flex flex-1 flex-col items-center justify-center gap-8 p-6 text-center"
    >
      {/* One announcement for the whole screen, in reading order. */}
      <span role="status" className="sr-only">
        {[t("reader.finish.title"), moral, rewardSentence, ...unlockSentences]
          .filter((line): line is string => line !== null)
          .join(" ")}
      </span>

      <h1 className="font-display text-4xl text-foreground sm:text-5xl">
        {t("reader.finish.title")}
      </h1>

      {moral === null ? null : (
        <p
          data-testid="story-moral"
          className="max-w-prose font-display text-2xl text-foreground sm:text-3xl"
        >
          {moral}
        </p>
      )}

      {/* `aria-hidden`: the sentence above already said it. */}
      {isRewardUnknown ? null : (
        <p
          aria-hidden="true"
          data-testid="story-reward"
          className="flex items-center gap-6 font-display text-foreground text-xl"
        >
          {granted === null ? (
            t("reader.finish.readAgainReward")
          ) : (
            <>
              <span className="inline-flex items-center gap-2">
                <Star className="size-8 fill-accent text-accent" />
                {granted.stars}
              </span>
              <span className="inline-flex items-center gap-2">
                <Coins className="size-8 fill-accent text-accent" />
                {granted.coins}
              </span>
            </>
          )}
        </p>
      )}

      {/* `aria-hidden` as above: the live region already named every one. */}
      {newBadges.length === 0 && newCharacters.length === 0 ? null : (
        <div
          aria-hidden="true"
          data-testid="story-unlocks"
          className="flex flex-wrap items-start justify-center gap-6"
        >
          {newBadges.map((badge) => (
            <BadgeReveal
              key={badge.id}
              kind="badge"
              name={badge.name}
              imageUrl={badge.iconUrl}
            />
          ))}
          {newCharacters.map((character) => (
            <BadgeReveal
              key={character.id}
              kind="character"
              name={character.name}
              imageUrl={character.imageUrl}
            />
          ))}
        </div>
      )}

      <div className="flex w-full max-w-md flex-col items-stretch gap-4 landscape:max-w-2xl landscape:flex-row">
        <BigButton
          size="lg"
          icon={<RotateCcw aria-hidden="true" />}
          onPress={onReadAgain}
        >
          {t("reader.finish.again")}
        </BigButton>
        <BigButton
          size="lg"
          variant="secondary"
          icon={<BookOpen aria-hidden="true" />}
          onPress={onMoreStories}
        >
          {t("reader.finish.more")}
        </BigButton>
      </div>
    </section>
  );
}
