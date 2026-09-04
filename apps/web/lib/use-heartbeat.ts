"use client";

import type {
  ActivityEventReport,
  ActivityEventResponse,
  ActivityEventType,
  HeartbeatResponse,
} from "@kidlearn/types";
import { useEffect, useState } from "react";
import { apiFetch } from "./api-client";

// The client half of server-derived learning time (FR-TIME-06).

/** The cadence the server's 30s tail credit is calibrated against. */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Posts a heartbeat every 30 seconds while the tab is visible, and reports back
 * how many minutes the child has learned today.
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

/** Records one discrete milestone — a lesson or story started or finished. */
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
