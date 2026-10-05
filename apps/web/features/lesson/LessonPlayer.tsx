"use client";

import { LESSON_NAMESPACE, toLocale } from "@kidlearn/i18n";
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
import { getLesson } from "@/features/content/content-api";
import { ScreenTimeLock } from "@/features/screen-time/ScreenTimeLock";
import {
  isScreenTimeBlock,
  windowStartFromError,
} from "@/features/screen-time/screen-time-api";
import { useHeartbeat } from "@/features/screen-time/use-heartbeat";
import {
  getLessonProgress,
  reportStep,
  sendSessionEvent,
} from "@/shared/api/progress-api";
import { useAudio } from "@/shared/components/AudioProvider";
import { BigButton } from "@/shared/components/kid/BigButton";
import { Retryable } from "@/shared/components/kid/Retryable";
import { StudentStatus } from "@/shared/components/kid/StudentStatus";
import { stepAssetFallback } from "./asset-fallback";
import { ExitConfirm } from "./ExitConfirm";
import {
  initialLessonState,
  type LessonPlayerState,
  lessonReducer,
} from "./lesson-machine";
import { createPendingWrites, type PendingWrites } from "./pending-writes";
import { StepContainer } from "./StepContainer";
import { ActivityStep } from "./steps/ActivityStep";
import { IntroStep } from "./steps/IntroStep";
import type { LessonStepProps } from "./steps/lesson-step-props";
import { QuizStep } from "./steps/QuizStep";
import { RewardStep } from "./steps/RewardStep";
import { VideoStep } from "./steps/VideoStep";

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
   * A state of its own, not an error: a child must never see a raw failure for a rule their grown-
   * up set (FR-TIME-02, FR-TIME-04). A lesson already under way is exempt server-side.
   */
  | {
      status: "blocked";
      reason: ScreenTimeBlockCode;
      windowStart: string | null;
    }
  | { status: "error" };

export interface LessonPlayerProps {
  lessonId: string;
  isPreview?: boolean;
  previewLanguage?: Locale;
}

export function LessonPlayer(props: LessonPlayerProps) {
  return (
    <Retryable>
      {(retry) => <LessonPlayerContent {...props} onRetry={retry} />}
    </Retryable>
  );
}

function LessonPlayerContent({
  lessonId,
  isPreview = false,
  previewLanguage,
  onRetry,
}: LessonPlayerProps & { onRetry: () => void }) {
  const { t, i18n } = useTranslation(LESSON_NAMESPACE);
  const contentLocale =
    (isPreview ? previewLanguage : undefined) ??
    toLocale(i18n.resolvedLanguage);
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [state, dispatch] = useReducer(lessonReducer, initialLessonState);
  // FR-TIME-06: the presence signal learning time derives from. On the player, not the student
  // layout, as home and profile picker are not learning surfaces.
  useHeartbeat({ enabled: load.status === "ready" && !isPreview });

  useEffect(() => {
    let isCurrent = true;

    // In parallel: the lesson and saved position are independent reads.
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
        // A lesson unpublished mid-session is a `404`: a closed door, not a failure to apologise
        // for.
        setLoad({
          status: lessonResult.error.code === "NOT_FOUND" ? "gone" : "error",
        });
        return;
      }

      // A failed progress read is not fatal: starting over beats refusing to open the lesson.
      const saved = progressResult?.ok ? progressResult.data.progress : null;
      // `currentStep` is the last step finished, so the target is its successor. A finished lesson
      // replays from `intro` (FR-LSN-06); the server's completion record is untouched.
      const resumeAt = resumeLessonStep(saved?.currentStep ?? null);

      // Batched with `setLoad`: resuming in an effect mounted the intro for a commit and restarted
      // its narration.
      dispatch({ type: "RESUME", step: resumeAt });
      setLoad({ status: "ready", lesson: lessonResult.data.lesson, resumeAt });
    });

    return () => {
      isCurrent = false;
    };
  }, [lessonId, isPreview, previewLanguage]);

  const resumeAt = load.status === "ready" ? load.resumeAt : undefined;

  const [pendingWrites] = useState(createPendingWrites);

  const hasStarted = useRef(false);
  useEffect(() => {
    if (resumeAt === undefined || hasStarted.current) return;
    hasStarted.current = true;

    if (!isPreview) sendSessionEvent({ type: "lesson_start", lessonId });
  }, [resumeAt, lessonId, isPreview]);

  // The audio provider outlives the player; without this, leaving mid-narration keeps it talking
  // over the world screen.
  const { stop } = useAudio();
  useEffect(() => stop, [stop]);

  useLessonRecording(
    state,
    lessonId,
    pendingWrites,
    // A preview never arms the recorder: `undefined` keeps the effect below in its "not started"
    // branch.
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
    return (
      <StudentStatus tone="alert" onRetry={onRetry}>
        {t("error")}
      </StudentStatus>
    );
  }

  const { lesson } = load;
  const backToWorld = () => router.push(`/world/${lesson.worldId}`);

  if (state.status === "finished") {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-8 p-6 text-center">
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
        // The intro already puts the mascot centre stage, so the container's corner copy is
        // withheld: two of one character reads as a bug.
        mascotUrl={
          state.step === "intro" ? undefined : lesson.world.mascot?.url
        }
        onExit={() => dispatch({ type: "EXIT" })}
      >
        <StepComponent
          lesson={lesson}
          isPreview={isPreview}
          pendingWrites={pendingWrites}
          locale={contentLocale}
          onComplete={() => dispatch({ type: "STEP_COMPLETE" })}
        />
      </StepContainer>

      <ExitConfirm
        isOpen={state.isConfirmingExit}
        onStay={() => dispatch({ type: "EXIT_CANCEL" })}
        onLeave={() => {
          // Nothing to save: the finished step was reported when it finished.
          dispatch({ type: "EXIT_CONFIRM" });
          backToWorld();
        }}
      />
    </>
  );
}

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

function useLessonRecording(
  state: LessonPlayerState,
  lessonId: string,
  pendingWrites: PendingWrites,
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
      pendingWrites.add(
        reportStep(lessonId, { step: finished, completed: false }),
      );
      // Which asset the step played, for the content-gap report (FR-I18N-01). Analytics only; steps
      // with no locale-resolved media omit the key.
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
      // No `reportStep` here: `RewardStep` calls the completion endpoint on mount, which reports
      // and writes the grants. The two analytics events still belong at the end of the flow.
      sendSessionEvent({ type: "step_complete", lessonId, step: "reward" });
      sendSessionEvent({ type: "lesson_complete", lessonId });
    }
  }, [state, lessonId, pendingWrites, resumeAt, assetFallbacks]);
}
