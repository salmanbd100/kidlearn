"use client";

import type {
  ActivityEventReport,
  ActivityEventResponse,
  ActivityEventType,
  HeartbeatResponse,
} from "@kidlearn/types";
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/api-client";

const HEARTBEAT_INTERVAL_MS = 30_000;

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

export function trackEvent(type: ActivityEventType, refId: string): void {
  const body: ActivityEventReport = { type, refId };

  void apiFetch<{ event: ActivityEventResponse }>("/api/events/activity", {
    method: "POST",
    body: JSON.stringify(body),
    // No retries, as `useHeartbeat`, and a late retry would land elsewhere or log a duplicate milestone for one crossing.
    retries: 0,
  }).then((result) => {
    if (!result.ok) {
      console.warn(
        `[kidlearn] activity event ${type} not recorded: ${result.error.code}`,
      );
    }
  });
}
