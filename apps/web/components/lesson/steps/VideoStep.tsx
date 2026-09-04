"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { BigButton } from "@/components/kid/BigButton";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { usePreloadNextStep } from "@/lib/use-preload-next-step";
import type { LessonStepProps } from "./lesson-step-props";
import { VideoControls, type VideoState } from "./VideoControls";

// The teaching video (FR-LSN-02, NFR-PERF-02).

export function VideoStep({ lesson, onComplete }: LessonStepProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const { stop: stopNarration } = useAudio();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<VideoState>("loading");
  const [watchedFraction, setWatchedFraction] = useState(0);
  const { videoUrl, videoPosterUrl } = lesson;

  usePreloadNextStep(lesson, state === "playing");

  // A locale fallback used to be logged here as well. It is not a diagnostic this
  // component needs to emit: `LessonPlayer` already puts `fallback` on the
  // `step_complete` event, which is the durable record the content-gap report is
  // built from (FR-I18N-01). A console line was a second, lossier copy of it.

  // Autoplay, and a graceful landing if the browser says no. The intro's
  // narration usually unlocked the gesture chain already, but "usually" is not a
  // guarantee on iOS — so a rejection lands on the poster with the play button
  // showing, which is exactly the paused state, never a dead screen.
  useEffect(() => {
    const element = videoRef.current;
    if (element === null || videoUrl === null) return;
    void element.play().catch(() => {
      setState((current) => (current === "playing" ? current : "paused"));
    });
  }, [videoUrl]);

  const playPause = useCallback(() => {
    const element = videoRef.current;
    if (element === null) return;
    if (state === "playing" || state === "buffering") {
      element.pause();
      return;
    }
    void element.play().catch(() => setState("paused"));
  }, [state]);

  const replay = useCallback(() => {
    const element = videoRef.current;
    if (element === null) return;
    element.currentTime = 0;
    void element.play().catch(() => setState("paused"));
  }, []);

  const retry = useCallback(() => {
    const element = videoRef.current;
    if (element === null) return;
    setState("loading");
    // `load()` and not a re-render: the src has not changed, and only an explicit
    // reload makes the element try the network again after a decode failure.
    element.load();
    void element.play().catch(() => setState("paused"));
  }, []);

  // A lesson with no video is a hole in the content, not a broken screen. The
  // child gets the same friendly nudge onward that the last frame gives them.
  if (videoUrl === null) {
    return (
      <StepShell>
        <p className="font-display text-2xl text-foreground">
          {t("video.error")}
        </p>
        <BigButton
          size="lg"
          isPulsing
          icon={<ArrowRight aria-hidden="true" />}
          onPress={onComplete}
        >
          {t("video.done")}
        </BigButton>
      </StepShell>
    );
  }

  return (
    <StepShell>
      <div className="relative w-full max-w-3xl overflow-hidden rounded-lg bg-muted">
        {/* biome-ignore lint/a11y/useMediaCaption: captions are post-MVP and not in the master spec — file 17 "Out of Scope". */}
        <video
          ref={videoRef}
          src={videoUrl}
          poster={videoPosterUrl ?? undefined}
          // Every one of these is a door the child must not find (FR-LSN-02).
          playsInline
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          preload="auto"
          className="aspect-video w-full"
          onCanPlay={() => setState((c) => (c === "loading" ? "ready" : c))}
          onPlaying={() => {
            stopNarration();
            setState("playing");
          }}
          onWaiting={() => setState("buffering")}
          onPause={() =>
            setState((c) => (c === "ended" || c === "error" ? c : "paused"))
          }
          onEnded={() => {
            setWatchedFraction(1);
            setState("ended");
          }}
          onError={() => setState("error")}
          onTimeUpdate={(event) => {
            const { currentTime, duration } = event.currentTarget;
            // A live or still-loading stream reports `Infinity` or `NaN`.
            if (!Number.isFinite(duration) || duration === 0) return;
            setWatchedFraction(currentTime / duration);
          }}
        />

        {state === "loading" ? (
          <div
            data-testid="video-skeleton"
            aria-hidden="true"
            className="absolute inset-0 motion-safe:animate-pulse bg-muted/60"
          />
        ) : null}

        {state === "buffering" ? (
          <div
            data-testid="video-buffering"
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="size-12 rounded-pill border-4 border-primary border-t-transparent motion-safe:animate-spin" />
          </div>
        ) : null}

        {state === "error" ? null : (
          <VideoControls
            state={state}
            onPlayPause={playPause}
            onReplay={replay}
          />
        )}

        {/*
          How much is left, and nothing more. Deliberately not a slider and not
          focusable: the moment a bar can be dragged it is a seek control, which
          is the one thing FR-LSN-02 rules out.
        */}
        {state === "error" ? null : (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-2 bg-muted"
          >
            <div
              data-testid="video-progress"
              className="h-full origin-left bg-primary transition-transform duration-300"
              style={{ transform: `scaleX(${watchedFraction})` }}
            />
          </div>
        )}

        <span role="status" className="sr-only">
          {state === "loading" ? t("video.loading") : ""}
        </span>
      </div>

      {state === "error" ? (
        <div className="flex flex-col items-center gap-4">
          <p className="font-display text-2xl text-foreground">
            {t("video.error")}
          </p>
          <BigButton
            variant="secondary"
            icon={<RotateCcw aria-hidden="true" />}
            onPress={retry}
          >
            {t("video.tryAgain")}
          </BigButton>
        </div>
      ) : null}

      {state === "ended" ? (
        <BigButton
          size="lg"
          isPulsing
          icon={<ArrowRight aria-hidden="true" />}
          onPress={onComplete}
        >
          {t("video.done")}
        </BigButton>
      ) : null}
    </StepShell>
  );
}

function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      data-step="video"
      className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
    >
      {children}
    </section>
  );
}
