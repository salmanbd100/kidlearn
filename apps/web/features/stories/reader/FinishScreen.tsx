"use client";

import type { StoryCompletionResponse } from "@kidlearn/types";
import { BookOpen, Coins, RotateCcw, Star } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/shared/components/AudioProvider";
import { BadgeReveal } from "@/shared/components/kid/BadgeReveal";
import { BigButton } from "@/shared/components/kid/BigButton";
import { LESSON_NAMESPACE, STUDENT_NAMESPACE } from "@/shared/lib/i18n";
import { unlockNames } from "@/shared/lib/unlock-names";

/**
 * The last screen of a story: what it was about, and what finishing it was worth
 * (FR-STORY-03, FR-STORY-06..07).
 */

/**
 * The part of a story completion this screen renders. Narrower than
 * `StoryCompletionResponse` on purpose: `streak` and `totals` are the server's
 * running figures, which the reader has no honest value for on a replay it never
 * posted — see `REPLAY_COMPLETION` in `StoryReader`.
 */
export type StoryFinishReward = Pick<
  StoryCompletionResponse,
  "granted" | "newBadges" | "newCharacters"
>;

export interface FinishScreenProps {
  moral: string | null;
  moralAudioUrl: string | null;
  /** `undefined` while the completion call is in flight, or if it failed. */
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
  // The unlock copy is the lesson celebration's, reused verbatim rather than
  // translated a second time into this namespace: a badge earned by reading and
  // a badge earned by finishing a lesson are the same event to a child.
  const { t: tLesson } = useTranslation(LESSON_NAMESPACE);
  const { play } = useAudio();

  useEffect(() => {
    if (moralAudioUrl === null) return;
    void play(moralAudioUrl, { interrupt: true });
  }, [play, moralAudioUrl]);

  const granted = completion?.granted ?? null;
  /** Nothing true to say about the reward yet — see the file header. */
  const isRewardUnknown = completion === undefined;

  // A story can unlock a badge or a character in its own right (FR-GAM-04..05):
  // "Reading Star — 10 stories" is earned by reading, so it has to be celebrated
  // here rather than waiting for the child's next lesson.
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
      {/* One announcement for the whole screen: the moral, then the reward, in
          the order they are read. */}
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

      {/* `aria-hidden` for the same reason the reward line above is: the
          sentence in the live region already named every one of them. */}
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
