"use client";

import type {
  LessonAssetFallbacks,
  LessonDetailResponse,
  LessonStep,
  Locale,
  ScreenTimeBlockCode,
} from "@kidlearn/types";
import { LESSON_STEPS, resumeLessonStep } from "@kidlearn/types";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StudentStatus } from "@/app/(student)/StudentGuard";
import { BigButton } from "@/components/kid/BigButton";
import { ScreenTimeLock } from "@/components/student/ScreenTimeLock";
import { getLesson } from "@/lib/content-api";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import {
  getLessonProgress,
  reportStep,
  sendSessionEvent,
} from "@/lib/progress-api";
import { isScreenTimeBlock, windowStartFromError } from "@/lib/screen-time-api";
import { useHeartbeat } from "@/lib/use-heartbeat";
import { stepAssetFallback } from "./asset-fallback";
import { ExitConfirm } from "./ExitConfirm";
import {
  initialLessonState,
  type LessonPlayerState,
  lessonReducer,
} from "./lesson-machine";
import { StepContainer } from "./StepContainer";
import { ActivityStep } from "./steps/ActivityStep";
import { IntroStep } from "./steps/IntroStep";
import type { LessonStepProps } from "./steps/lesson-step-props";
import { QuizStep } from "./steps/QuizStep";
import { RewardStep } from "./steps/RewardStep";
import { VideoStep } from "./steps/VideoStep";

// The lesson player (FR-LSN-01..07, Pillar B).

/** Whether `step` is at or past `target` in flow order. See `useLessonRecording`. */
function hasReachedStep(step: LessonStep, target: LessonStep): boolean {
  return LESSON_STEPS.indexOf(step) >= LESSON_STEPS.indexOf(target);
}

const STEP_COMPONENTS: Record<
  LessonStep,
  (props: LessonStepProps) => ReactNode
> = {
  intro: IntroStep,
  video: VideoStep,
  activity: ActivityStep,
  quiz: QuizStep,
  reward: RewardStep,
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; lesson: LessonDetailResponse; resumeAt: LessonStep }
  | { status: "gone" }
  /**
   * The parental screen-time gate refused this start (FR-TIME-02, FR-TIME-04).
   * A state of its own rather than an error, because a child must never be shown
   * a raw failure for a rule their grown-up set — and because a lesson already
   * under way is exempt server-side, so reaching this means the child really was
   * starting something new.
   */
  | {
      status: "blocked";
      reason: ScreenTimeBlockCode;
      windowStart: string | null;
    }
  | { status: "error" };

export interface LessonPlayerProps {
  lessonId: string;
  /** Administrator preview: unpublished content, a banner, and no writes. */
  isPreview?: boolean;
  /** Which locale to preview in. Ignored outside preview — a child has a profile. */
  previewLanguage?: Locale;
}

export function LessonPlayer({
  lessonId,
  isPreview = false,
  previewLanguage,
}: LessonPlayerProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [state, dispatch] = useReducer(lessonReducer, initialLessonState);
  // FR-TIME-06 — the presence signal learning time is derived from. Mounted on the
  // player rather than on the student layout: this is a learning surface, and the
  // home screen and profile picker are not. It measures nothing locally, so there
  // is no total here for a refresh to reset.
  useHeartbeat({ enabled: load.status === "ready" && !isPreview });

  useEffect(() => {
    let isCurrent = true;

    // In parallel: the lesson and the saved position are independent reads behind
    // the same two guards, so neither has a reason to wait for the other.
    void Promise.all([
      getLesson(lessonId, {
        isPreview,
        ...(previewLanguage ? { language: previewLanguage } : {}),
        onColdStart: () => {
          if (isCurrent) setIsWakingUp(true);
        },
      }),
      isPreview ? Promise.resolve(null) : getLessonProgress(lessonId),
    ]).then(([lessonResult, progressResult]) => {
      if (!isCurrent) return;
      setIsWakingUp(false);

      if (!lessonResult.ok) {
        if (isScreenTimeBlock(lessonResult.error)) {
          setLoad({
            status: "blocked",
            reason: lessonResult.error.code,
            windowStart: windowStartFromError(lessonResult.error) ?? null,
          });
          return;
        }
        // A lesson unpublished while the child was on the world screen is a `404` —
        // a door that closed, not a failure to apologise for.
        setLoad({
          status: lessonResult.error.code === "NOT_FOUND" ? "gone" : "error",
        });
        return;
      }

      // A failed progress read is not fatal. Starting over is worse than resuming,
      // and far better than refusing to open a lesson the child asked for.
      const saved = progressResult?.ok ? progressResult.data.progress : null;
      // `currentStep` is the last step *finished*, so the target is its successor.
      // A finished lesson has no successor to `reward` and replays from `intro`
      // (FR-LSN-06) — the server's completion record is untouched by the replay.
      const resumeAt = resumeLessonStep(saved?.currentStep ?? null);

      setLoad({ status: "ready", lesson: lessonResult.data.lesson, resumeAt });
    });

    return () => {
      isCurrent = false;
    };
  }, [lessonId, isPreview, previewLanguage]);

  const resumeAt = load.status === "ready" ? load.resumeAt : undefined;

  // Resume and announce the start, once, as soon as the data lands.
  const hasStarted = useRef(false);
  useEffect(() => {
    if (resumeAt === undefined || hasStarted.current) return;
    hasStarted.current = true;

    if (!isPreview) sendSessionEvent({ type: "lesson_start", lessonId });
    dispatch({ type: "RESUME", step: resumeAt });
  }, [resumeAt, lessonId, isPreview]);

  useLessonRecording(
    state,
    lessonId,
    // A preview never arms the recorder: passing `undefined` here is what keeps
    // the effect below in its "not started" branch for the whole session.
    isPreview ? undefined : resumeAt,
    load.status === "ready" ? load.lesson.assetFallbacks : undefined,
  );

  if (load.status === "loading") {
    return (
      <StudentStatus tone="status">
        {isWakingUp ? t("waking") : t("loading")}
      </StudentStatus>
    );
  }
  if (load.status === "gone") {
    return <StudentStatus tone="status">{t("notFound")}</StudentStatus>;
  }
  if (load.status === "blocked") {
    return (
      <ScreenTimeLock reason={load.reason} windowStart={load.windowStart} />
    );
  }
  if (load.status === "error") {
    return <StudentStatus tone="alert">{t("error")}</StudentStatus>;
  }

  const { lesson } = load;
  const backToWorld = () => router.push(`/world/${lesson.worldId}`);

  if (state.status === "finished") {
    return (
      <section className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-8 p-6 text-center">
        <h1 className="font-display text-3xl text-foreground">
          {t("finished.title")}
        </h1>
        <BigButton
          size="lg"
          icon={<ArrowLeft aria-hidden="true" />}
          onPress={backToWorld}
        >
          {t("finished.back")}
        </BigButton>
      </section>
    );
  }

  const StepComponent = STEP_COMPONENTS[state.step];

  return (
    <>
      {isPreview ? <PreviewBanner /> : null}

      <StepContainer
        step={state.step}
        // The intro puts the mascot centre stage and talks through it (file 17),
        // so the container's small corner copy is withheld there — two of the
        // same character on one screen reads as a bug to the adult and as two
        // characters to the child.
        mascotUrl={
          state.step === "intro" ? undefined : lesson.world.mascot?.url
        }
        onExit={() => dispatch({ type: "EXIT" })}
      >
        <StepComponent
          lesson={lesson}
          isPreview={isPreview}
          onComplete={() => dispatch({ type: "STEP_COMPLETE" })}
        />
      </StepContainer>

      <ExitConfirm
        isOpen={state.isConfirmingExit}
        onStay={() => dispatch({ type: "EXIT_CANCEL" })}
        onLeave={() => {
          // Nothing to save here: the step that finished was reported when it
          // finished. Leaving is only a navigation.
          dispatch({ type: "EXIT_CONFIRM" });
          backToWorld();
        }}
      />
    </>
  );
}

/** The "this is not a child's session" strip (FR-CMS-04). */
function PreviewBanner() {
  const { t } = useTranslation(LESSON_NAMESPACE);
  return (
    <p
      role="status"
      data-theme="parent"
      className="fixed inset-x-0 top-0 z-50 bg-foreground px-3 py-1.5 text-center font-ui font-semibold text-background text-xs uppercase tracking-wide"
    >
      {t("preview.banner")}
    </p>
  );
}

/**
 * Reports each step as the reducer leaves it, and stamps completion at the end.
 */
function useLessonRecording(
  state: LessonPlayerState,
  lessonId: string,
  resumeAt: LessonStep | undefined,
  assetFallbacks: LessonAssetFallbacks | undefined,
): void {
  const previous = useRef<LessonPlayerState | undefined>(undefined);

  useEffect(() => {
    if (previous.current === undefined) {
      if (
        resumeAt === undefined ||
        state.status !== "playing" ||
        !hasReachedStep(state.step, resumeAt)
      ) {
        return;
      }
      previous.current = state;
      return;
    }

    const before = previous.current;
    previous.current = state;

    if (
      before.status === "playing" &&
      state.status === "playing" &&
      before.step !== state.step
    ) {
      const finished = before.step;
      void reportStep(lessonId, { step: finished, completed: false });
      // Which asset that step actually played, for the content-gap report
      // (FR-I18N-01). Nothing the child saw depended on it — the server had
      // already resolved the URL — so it rides on the analytics event only, and
      // a step with no locale-resolved media of its own omits the key rather
      // than claiming it played the right language.
      const fallback =
        assetFallbacks === undefined
          ? undefined
          : stepAssetFallback(finished, assetFallbacks);
      sendSessionEvent({
        type: "step_complete",
        lessonId,
        step: finished,
        ...(fallback === undefined ? {} : { fallback }),
      });
      return;
    }

    if (before.status === "playing" && state.status === "finished") {
      // No `reportStep` here any more: `RewardStep` calls the completion
      // endpoint on mount, which performs this same reward-step report *and*
      // writes the grants (file 23). Completion therefore lands when the child
      // reaches the celebration rather than when they leave it — the numbers on
      // that screen are the server's answer, and there is nowhere else to ask.
      // The two analytics events still belong here, at the end of the flow.
      sendSessionEvent({ type: "step_complete", lessonId, step: "reward" });
      sendSessionEvent({ type: "lesson_complete", lessonId });
    }
  }, [state, lessonId, resumeAt, assetFallbacks]);
}
