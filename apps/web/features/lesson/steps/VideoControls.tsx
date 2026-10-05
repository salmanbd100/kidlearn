"use client";

import { LESSON_NAMESPACE } from "@kidlearn/i18n";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

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

  // Nothing to offer while the first frame arrives, or once ended: replay and the step's advance
  // button take over.
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
          // 80px, above the 64px kid minimum: aimed at while the screen is a moving picture
          // (design.md §7).
          className="pointer-events-auto inline-flex size-20 items-center justify-center rounded-pill bg-background/80 text-foreground shadow-lg backdrop-blur transition-[background-color,opacity] touch-manipulation hover:bg-background focus-ring data-[playing=true]:opacity-0 data-[playing=true]:hover:opacity-100 data-[playing=true]:focus-visible:opacity-100"
          // Fades rather than unmounts: a control that disappears cannot be tapped, and one that
          // moves must be found twice.
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
          className="pointer-events-auto inline-flex size-20 items-center justify-center rounded-pill bg-secondary text-secondary-foreground shadow-lg transition-colors touch-manipulation hover:bg-secondary/80 focus-ring"
          aria-label={t("video.replay")}
          onClick={onReplay}
        >
          <RotateCcw aria-hidden="true" className="size-10" />
        </button>
      ) : null}
    </div>
  );
}
