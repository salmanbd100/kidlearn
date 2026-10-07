import { LESSON_STEPS, type LessonStep } from "@kidlearn/types";
import type { ApiResult } from "@/shared/api/api-client";
import { reportStep } from "@/shared/api/progress-api";

type ReportStep = (
  lessonId: string,
  report: { step: LessonStep; completed: false },
) => Promise<ApiResult<unknown>>;

/**
 * Reports finished steps so the server's order check never strands the run: a report the server did
 * not confirm is re-sent ahead of the next, as without it every later step is refused and the
 * completion is never paid. Calls must not overlap; `PendingWrites` runs them one at a time.
 */
export function createStepReporter(
  lessonId: string,
  resumeAt: LessonStep,
  send: ReportStep = reportStep,
) {
  let confirmed = LESSON_STEPS.indexOf(resumeAt) - 1;

  return async function reportFinished(finished: LessonStep): Promise<void> {
    const target = LESSON_STEPS.indexOf(finished);
    let hasResynced = false;

    while (confirmed < target) {
      const step = LESSON_STEPS[confirmed + 1];
      const result = await send(lessonId, { step, completed: false });
      if (result.ok) {
        confirmed += 1;
        continue;
      }

      // The server is behind what this player believed (a resume read that went stale): restart
      // from what it holds, once, rather than loop on a refusal.
      const serverStep = outOfOrderStep(result.error);
      if (serverStep === undefined || hasResynced) return;
      hasResynced = true;
      confirmed = serverStep === null ? -1 : LESSON_STEPS.indexOf(serverStep);
    }
  };
}

function outOfOrderStep(error: {
  code: string;
  details?: unknown;
}): LessonStep | null | undefined {
  const { details } = error;
  if (error.code !== "CONFLICT" || typeof details !== "object" || !details) {
    return undefined;
  }
  if (!("code" in details) || details.code !== "STEP_OUT_OF_ORDER") {
    return undefined;
  }
  if (!("currentStep" in details)) return undefined;
  if (details.currentStep === null) return null;
  return LESSON_STEPS.find((step) => step === details.currentStep);
}
