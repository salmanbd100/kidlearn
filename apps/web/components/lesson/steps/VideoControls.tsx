"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LESSON_NAMESPACE } from "@/lib/i18n";

/**
 * Everything a three-year-old is allowed to do to a video (FR-LSN-02).
 *
 * **The list is short on purpose.** Play/pause and start-again, and that is all.
 * There is no seek bar, because scrubbing is a fine-motor task a preschooler
 * fails at and lands on a random frame; no volume slider, because the device has
 * one and a muted lesson is indistinguishable from a broken one; and no
 * fullscreen or picture-in-picture, because both are doors out of the app into
 * browser chrome nobody can get back from (NFR-SAFE-07). The native `controls`
 * attribute is off in `VideoStep` for the same reason, and its absence is
 * asserted there.
 *
 * Split out from `VideoStep` so this — the part with a state per button — is
 * testable without a media element that jsdom cannot play.
 */

export type VideoState =
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "buffering"
  | "ended"
  | "error";

export interface VideoControlsProps {
  state: VideoState;
  onPlayPause: () => void;
  onReplay: () => void;
}

export function VideoControls({
  state,
  onPlayPause,
  onReplay,
}: VideoControlsProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);

  // Nothing to offer while the first frame is still arriving, and nothing to
  // toggle once it is over — the ended state hands over to replay and the
  // step's own advance button.
  const canToggle =
    state === "ready" ||
    state === "playing" ||
    state === "paused" ||
    state === "buffering";
  const isPlaying = state === "playing" || state === "buffering";

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-6">
      {canToggle ? (
        <button
          type="button"
          data-testid="video-play-pause"
          // 80px, above the 64px kid minimum: this is the one control a child
          // aims at while the screen is otherwise a moving picture (design.md §7).
          className="pointer-events-auto inline-flex size-20 items-center justify-center rounded-pill bg-background/80 text-foreground shadow-lg backdrop-blur transition-[background-color,opacity] [touch-action:manipulation] hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[playing=true]:opacity-0 data-[playing=true]:hover:opacity-100 data-[playing=true]:focus-visible:opacity-100"
          // Fades out of the way while the film runs rather than unmounting:
          // a control that disappears cannot be tapped by a child who wants to
          // stop, and one that moves is a control they have to find twice.
          data-playing={isPlaying}
          aria-label={isPlaying ? t("video.pause") : t("video.play")}
          onClick={onPlayPause}
        >
          {isPlaying ? (
            <Pause aria-hidden="true" className="size-10" />
          ) : (
            <Play aria-hidden="true" className="size-10" />
          )}
        </button>
      ) : null}

      {state === "ended" ? (
        <button
          type="button"
          data-testid="video-replay"
          className="pointer-events-auto inline-flex size-20 items-center justify-center rounded-pill bg-secondary text-secondary-foreground shadow-lg transition-colors [touch-action:manipulation] hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={t("video.replay")}
          onClick={onReplay}
        >
          <RotateCcw aria-hidden="true" className="size-10" />
        </button>
      ) : null}
    </div>
  );
}
