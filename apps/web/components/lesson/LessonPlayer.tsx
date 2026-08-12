"use client";

import type {
  LessonAssetFallbacks,
  LessonDetailResponse,
  LessonStep,
} from "@kidlearn/types";
import { resumeLessonStep } from "@kidlearn/types";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StudentStatus } from "@/app/(student)/StudentGuard";
import { BigButton } from "@/components/kid/BigButton";
import { getLesson } from "@/lib/content-api";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import {
  getLessonProgress,
  reportStep,
  sendSessionEvent,
} from "@/lib/progress-api";
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

/**
 * The lesson player (FR-LSN-01..07, Pillar B).
 *
 * **The flow's rules are in `lesson-machine.ts`; every effect is here.** That split
 * is the design of this file. The reducer decides what step follows what; this
 * component watches its output and tells the server. Nothing below decides a
 * transition, and nothing in the reducer touches the network — so the flow is
 * testable as a table and the recording is testable with a mocked API.
 *
 * **Progress is written per step, not on the way out.** Each completed step posts
 * before the next renders, which is what makes FR-LSN-06 hold for the case it exists
 * for: a tablet whose battery dies mid-video was never going to reach an unload
 * handler, so `beforeunload` is deliberately not used.
 *
 * **The two writes are different kinds of write.** `reportStep` is the child's
 * progress — retried, and idempotent server-side. `sendSessionEvent` is analytics —
 * fire-and-forget, no retries, failures logged. Neither ever blocks a step from
 * rendering, and neither is awaited on the path a child is looking at.
 */

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
  | { status: "error" };

export function LessonPlayer({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [state, dispatch] = useReducer(lessonReducer, initialLessonState);

  useEffect(() => {
    let isCurrent = true;

    // In parallel: the lesson and the saved position are independent reads behind
    // the same two guards, so neither has a reason to wait for the other.
    void Promise.all([
      getLesson(lessonId, {
        onColdStart: () => {
          if (isCurrent) setIsWakingUp(true);
        },
      }),
      getLessonProgress(lessonId),
    ]).then(([lessonResult, progressResult]) => {
      if (!isCurrent) return;
      setIsWakingUp(false);

      if (!lessonResult.ok) {
        // A lesson unpublished while the child was on the world screen is a `404` —
        // a door that closed, not a failure to apologise for.
        setLoad({
          status: lessonResult.error.code === "NOT_FOUND" ? "gone" : "error",
        });
        return;
      }

      // A failed progress read is not fatal. Starting over is worse than resuming,
      // and far better than refusing to open a lesson the child asked for.
      const saved = progressResult.ok ? progressResult.data.progress : null;
      // `currentStep` is the last step *finished*, so the target is its successor.
      // A finished lesson has no successor to `reward` and replays from `intro`
      // (FR-LSN-06) — the server's completion record is untouched by the replay.
      const resumeAt = resumeLessonStep(saved?.currentStep ?? null);

      setLoad({ status: "ready", lesson: lessonResult.data.lesson, resumeAt });
    });

    return () => {
      isCurrent = false;
    };
  }, [lessonId]);

  const resumeAt = load.status === "ready" ? load.resumeAt : undefined;

  // Resume and announce the start, once, as soon as the data lands.
  const hasStarted = useRef(false);
  useEffect(() => {
    if (resumeAt === undefined || hasStarted.current) return;
    hasStarted.current = true;

    sendSessionEvent({ type: "lesson_start", lessonId });
    dispatch({ type: "RESUME", step: resumeAt });
  }, [resumeAt, lessonId]);

  useLessonRecording(
    state,
    lessonId,
    resumeAt,
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

/**
 * Reports each step as the reducer leaves it, and stamps completion at the end.
 *
 * Driven by *transitions*, not by the current step: the step to report is the one the
 * child just left, which is only knowable by comparing against the previous render.
 * Hence the ref — the one place the player keeps history, kept out of the component
 * body so the reason is written down once.
 *
 * **Observation starts at the resumed step, not at the reducer's initial state.**
 * `RESUME` arrives as a dispatch, so a lesson resuming at `activity` renders `intro`
 * for one frame first; treating that as a transition would report an `intro` the
 * child never watched. The guard below waits for the resumed step to actually be on
 * screen before it starts comparing — which is a no-op for a fresh lesson, whose
 * resume target *is* `intro`.
 *
 * The `reward` report is the completion, and it fires on entering `finished` rather
 * than on leaving `quiz`: a child who never taps through the celebration has not
 * finished the lesson.
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
        state.step !== resumeAt
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
      void reportStep(lessonId, { step: "reward", completed: true });
      sendSessionEvent({ type: "step_complete", lessonId, step: "reward" });
      sendSessionEvent({ type: "lesson_complete", lessonId });
    }
  }, [state, lessonId, resumeAt, assetFallbacks]);
}
