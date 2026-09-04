"use client";

import type { PlatformOverview } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import { useCallback, useEffect, useState } from "react";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { fetchPlatformOverview } from "@/lib/admin-api";

/** `/admin/analytics` — the four platform counters (FR-CMS-07, basic tier). */
const CARDS: ReadonlyArray<{
  key: keyof Omit<PlatformOverview, "generatedAt">;
  label: string;
}> = [
  { key: "totalParents", label: "Parents" },
  { key: "totalChildren", label: "Child profiles" },
  { key: "lessonsCompletedThisWeek", label: "Lessons done this week" },
  { key: "dauToday", label: "Children active today" },
];

export function AnalyticsScreen() {
  const [overview, setOverview] = useState<PlatformOverview | undefined>();
  const [status, setStatus] = useState<
    "loading" | "waking" | "ready" | "error"
  >("loading");

  const load = useCallback(async () => {
    setStatus("loading");

    const result = await fetchPlatformOverview({
      // The API sleeps on its free tier, so the first request after idle is slow.
      // Saying so beats a spinner that looks broken (NFR-PERF-04).
      onColdStart: () => setStatus("waking"),
    });

    if (result.ok) {
      setOverview(result.data);
      setStatus("ready");
      return;
    }
    setStatus("error");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-semibold text-foreground text-xl">Analytics</h1>
          <p className="text-muted-foreground text-xs">
            {overview === undefined
              ? "Platform totals."
              : `Platform totals, read at ${formatReadAt(overview.generatedAt)}.`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={status === "loading" || status === "waking"}
        >
          Refresh
        </Button>
      </header>

      {status === "waking" ? (
        <p role="status" className="text-muted-foreground text-sm">
          Waking the API up…
        </p>
      ) : null}

      {status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          Could not load the platform counters.
        </p>
      ) : null}

      {overview === undefined ? null : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CARDS.map(({ key, label }) => (
            <AdminStatCard
              key={key}
              label={label}
              value={String(overview[key])}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Time only, not the date: the counters are read on the spot, so the day is always
 * today and printing it adds noise. `en-GB` to match the locale the rest of the
 * product formats in.
 */
function formatReadAt(isoDateTime: string): string {
  return new Date(isoDateTime).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
