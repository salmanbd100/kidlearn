"use client";

import type {
  ActivityEventReport,
  ActivityEventResponse,
  ActivityEventType,
  HeartbeatResponse,
} from "@kidlearn/types";
import { useEffect, useState } from "react";
import { apiFetch } from "./api-client";

/**
 * The client half of server-derived learning time (FR-TIME-06).
 *
 * **This file measures nothing.** It has no timer whose elapsed value it reports,
 * no accumulator and no stored total — it posts "I am here" every 30 seconds and
 * reads back whatever the server says the child has done today. That is the whole
 * anti-tamper design: refreshing the page, closing the tab, clearing storage or
 * editing React state cannot lower a figure that was never held here.
 *
 * Mount `useHeartbeat` on student **learning** surfaces only — the lesson player
 * and the story reader. Not on the profile picker, not on the home screen, and
 * never in a parent or admin layout: the figure it feeds is "how long has this
 * child been learning", and a dashboard left open would answer that question with
 * an adult's afternoon.
 */

/** The cadence the server's 30s tail credit is calibrated against. */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Posts a heartbeat every 30 seconds while the tab is visible, and reports back
 * how many minutes the child has learned today.
 *
 * **Only while visible, and that is load-bearing.** A background tab has no child
 * in front of it. Without the `visibilitychange` pause, a lesson left open in
 * another window would bill a whole afternoon of screen time — and file 28 would
 * lock a child out of a device they had not been using.
 *
 * One beat fires immediately on mount (and again on becoming visible), so a short
 * visit is worth its 30-second interval instead of nothing.
 *
 * **`enabled` is the same rule as visibility, one level up.** A visible tab that
 * is showing a loading spinner or the screen-time lock screen has no child
 * *learning* in front of it either, and the heartbeat endpoint is deliberately
 * ungated — so a caller that mounts this above its own ready state would bill a
 * child for staring at "time's up". Pass `enabled` whenever the hook cannot be
 * mounted on the learning surface itself.
 *
 * **No retries, ever.** A beat that failed has already been superseded by the next
 * tick 30 seconds later, and a queue of stale retries would report a child's
 * timeline out of order. `minutesToday` simply keeps its previous value until a
 * beat lands — `null` until the first one does.
 */
export function useHeartbeat({ enabled = true }: { enabled?: boolean } = {}): {
  minutesToday: number | null;
} {
  const [minutesToday, setMinutesToday] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let isCurrent = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    const send = () => {
      void apiFetch<HeartbeatResponse>("/api/events/heartbeat", {
        method: "POST",
        retries: 0,
      }).then((result) => {
        if (!isCurrent || !result.ok) return;
        // Sent on a dropped beat too, so a throttled client still sees an honest
        // total (see the endpoint's `recorded` flag).
        setMinutesToday(result.data.minutesToday);
      });
    };

    const start = () => {
      if (timer !== undefined) return;
      send();
      timer = setInterval(send, HEARTBEAT_INTERVAL_MS);
    };

    const stop = () => {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        start();
      } else {
        stop();
      }
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCurrent = false;
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled]);

  return { minutesToday };
}

/**
 * Records one discrete milestone — a lesson or story started or finished.
 *
 * **Fire-and-forget.** Nothing a child sees waits on this, and a failure is a
 * console warning and no more: a missing event costs a report some precision, and
 * an interrupted story costs the story. Callers do not await it.
 *
 * `refId` is the lesson or story id; which table it is resolved against follows
 * from `type` server-side. There is no timestamp parameter, and there is no
 * duration — the row's time is the server's (FR-TIME-06).
 *
 * The lesson player keeps using `sendSessionEvent` in `progress-api.ts` for its
 * own step events: that endpoint carries a lesson's `step` and locale-`fallback`
 * detail, which this one has no field for.
 */
export function trackEvent(type: ActivityEventType, refId: string): void {
  const body: ActivityEventReport = { type, refId };

  void apiFetch<{ event: ActivityEventResponse }>("/api/events/activity", {
    method: "POST",
    body: JSON.stringify(body),
    // No retries, for the reason `useHeartbeat` gives and one of its own: by the
    // time a retry landed the child would be somewhere else, and a duplicate that
    // succeeded would put a second milestone in the log for one crossing.
    retries: 0,
  }).then((result) => {
    if (!result.ok) {
      console.warn(
        `[kidlearn] activity event ${type} not recorded: ${result.error.code}`,
      );
    }
  });
}
