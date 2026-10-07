import type { LessonStep } from "@kidlearn/types";
import { describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/shared/api/api-client";
import { createStepReporter } from "./step-reports";

const LESSON_ID = "lesson_1";

type Result = ApiResult<unknown>;

const OK: Result = { ok: true, data: {} };
const DROPPED: Result = {
  ok: false,
  error: { code: "NETWORK_ERROR", message: "offline" },
};

function outOfOrder(currentStep: LessonStep | null): Result {
  return {
    ok: false,
    error: {
      code: "CONFLICT",
      message: "Lesson steps must be reported in order",
      status: 409,
      details: { code: "STEP_OUT_OF_ORDER", currentStep },
    },
  };
}

/** A server holding the furthest step it accepted, refusing a jump as `assertReachable` does. */
function fakeServer(initial: LessonStep | null, drops: LessonStep[] = []) {
  const order: LessonStep[] = ["intro", "video", "activity", "quiz", "reward"];
  let stored = initial;
  const pendingDrops = [...drops];
  const send = vi.fn(
    async (_lessonId: string, report: { step: LessonStep }) => {
      const dropAt = pendingDrops.indexOf(report.step);
      if (dropAt !== -1) {
        pendingDrops.splice(dropAt, 1);
        return DROPPED;
      }
      const furthest = stored === null ? 0 : order.indexOf(stored) + 1;
      if (order.indexOf(report.step) > furthest) return outOfOrder(stored);
      if (stored === null || order.indexOf(report.step) > order.indexOf(stored))
        stored = report.step;
      return OK;
    },
  );
  return { send, stored: () => stored };
}

function sentSteps(send: ReturnType<typeof fakeServer>["send"]) {
  return send.mock.calls.map(([, report]) => report.step);
}

describe("createStepReporter", () => {
  it("reports each finished step once when nothing is lost", async () => {
    const server = fakeServer(null);
    const report = createStepReporter(LESSON_ID, "intro", server.send);

    await report("intro");
    await report("video");

    expect(sentSteps(server.send)).toEqual(["intro", "video"]);
    expect(server.send).toHaveBeenCalledWith(LESSON_ID, {
      step: "intro",
      completed: false,
    });
  });

  it("re-sends a dropped report ahead of the next, so the run reaches the activity", async () => {
    // A dropped `intro` used to leave every later report refused, and the completion with it.
    const server = fakeServer(null, ["intro"]);
    const report = createStepReporter(LESSON_ID, "intro", server.send);

    await report("intro");
    await report("video");
    await report("activity");

    expect(sentSteps(server.send)).toEqual([
      "intro",
      "intro",
      "video",
      "activity",
    ]);
    expect(server.stored()).toBe("activity");
  });

  it("starts from the resume point, not the beginning", async () => {
    const server = fakeServer("video");
    const report = createStepReporter(LESSON_ID, "activity", server.send);

    await report("activity");

    expect(sentSteps(server.send)).toEqual(["activity"]);
  });

  it("resyncs once from the step the server holds when it refuses the order", async () => {
    // The resume read said `video`, but the server holds only `intro`.
    const server = fakeServer("intro");
    const report = createStepReporter(LESSON_ID, "activity", server.send);

    await report("activity");

    expect(sentSteps(server.send)).toEqual(["activity", "video", "activity"]);
    expect(server.stored()).toBe("activity");
  });

  it("gives up on a refusal it cannot resync from, rather than looping", async () => {
    const send = vi.fn(async () => outOfOrder(null));
    const report = createStepReporter(LESSON_ID, "intro", send);

    await report("video");

    // `intro` refused, resync to the start, `intro` refused again: stop.
    expect(send).toHaveBeenCalledTimes(2);
  });
});
