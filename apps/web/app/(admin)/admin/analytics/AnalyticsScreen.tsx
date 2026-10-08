"use client";

import type { PlatformOverview } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import {
  Activity,
  Baby,
  BookCheck,
  type LucideIcon,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminEmptyState } from "@/features/admin/AdminEmptyState";
import { AdminPageHeader } from "@/features/admin/AdminPageHeader";
import { AdminStatCard } from "@/features/admin/AdminStatCard";
import { fetchPlatformOverview } from "@/features/admin/admin-api";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";
import { fetchAiJobCount } from "@/features/admin/ai-api";

const CARDS: ReadonlyArray<{
  key: keyof Omit<PlatformOverview, "generatedAt">;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "totalParents", label: "Parents", icon: Users },
  { key: "totalChildren", label: "Child profiles", icon: Baby },
  {
    key: "lessonsCompletedThisWeek",
    label: "Lessons done this week",
    icon: BookCheck,
  },
  { key: "dauToday", label: "Children active today", icon: Activity },
];

export function AnalyticsScreen() {
  const [overview, setOverview] = useState<PlatformOverview | undefined>();
  const [awaitingReview, setAwaitingReview] = useState<number>();
  const [status, setStatus] = useState<
    "loading" | "waking" | "ready" | "error"
  >("loading");

  const load = useCallback(async () => {
    setStatus("loading");

    const [result, count] = await Promise.all([
      fetchPlatformOverview({
        // The API sleeps on its free tier; say so rather than show a spinner that looks broken.
        onColdStart: () => setStatus("waking"),
      }),
      fetchAiJobCount(),
    ]);

    // The queue card is a convenience; its failure leaves the platform counters standing.
    setAwaitingReview(count.ok ? count.data.awaitingReview : undefined);

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

  const isLoading = status === "loading" || status === "waking";

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Analytics"
        description={
          overview === undefined
            ? "Platform totals."
            : `Platform totals, read at ${formatReadAt(overview.generatedAt)}.`
        }
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={isLoading}
          >
            <RefreshCw aria-hidden="true" className="size-4!" />
            Refresh
          </Button>
        }
      />

      {status === "waking" ? (
        <p role="status" className="text-muted-foreground text-sm">
          Waking the API up…
        </p>
      ) : null}

      {status === "error" ? (
        <AdminEmptyState
          tone="error"
          icon={TriangleAlert}
          title="Could not load the platform counters."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
            >
              Try again
            </Button>
          }
        />
      ) : null}

      {overview === undefined ? (
        isLoading ? (
          <StatSkeleton />
        ) : null
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CARDS.map(({ key, label, icon }) => (
            <AdminStatCard
              key={key}
              label={label}
              icon={icon}
              value={String(overview[key])}
            />
          ))}
        </div>
      )}

      {awaitingReview === undefined ? null : (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-foreground text-sm">
            Needs your attention
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard
              label="Awaiting review"
              icon={Sparkles}
              value={String(awaitingReview)}
              tone={awaitingReview > 0 ? "attention" : "default"}
              href={ADMIN_ROUTES.aiQueue}
              linkLabel="Open the AI Queue"
            />
          </div>
        </section>
      )}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {CARDS.map(({ key }) => (
        <div
          key={key}
          className="h-31 rounded-(--radius) border border-border bg-card motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}

/** Time only (counters are read live); `en-GB` matches the product's locale. */
function formatReadAt(isoDateTime: string): string {
  return new Date(isoDateTime).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
