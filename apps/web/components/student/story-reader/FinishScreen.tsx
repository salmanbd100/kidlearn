"use client";

import type { StoryCompletionResponse } from "@kidlearn/types";
import { BookOpen, Coins, RotateCcw, Star } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { BigButton } from "@/components/kid/BigButton";
import { STUDENT_NAMESPACE } from "@/lib/i18n";

/**
 * The last screen of a story: what it was about, and what finishing it was worth
 * (FR-STORY-03, FR-STORY-06..07).
 */

export interface FinishScreenProps {
  moral: string | null;
  moralAudioUrl: string | null;
  /** `undefined` while the completion call is in flight, or if it failed. */
  completion: StoryCompletionResponse | undefined;
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
  const { play } = useAudio();

  useEffect(() => {
    if (moralAudioUrl === null) return;
    void play(moralAudioUrl, { interrupt: true });
  }, [play, moralAudioUrl]);

  const granted = completion?.granted ?? null;
  /** Nothing true to say about the reward yet — see the file header. */
  const isRewardUnknown = completion === undefined;

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
      {/* One announcement for the whole screen: the moral, then the reward, in
          the order they are read. */}
      <span role="status" className="sr-only">
        {[t("reader.finish.title"), moral, rewardSentence]
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

      {/* Everything below is `aria-hidden`: the sentence above already said it,
          and two icons plus two numbers read aloud say nothing. */}
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
