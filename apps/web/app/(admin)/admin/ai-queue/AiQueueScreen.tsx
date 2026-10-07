"use client";

import type {
  AiJobStatus,
  AiJobSummary,
  AiJobType,
  GradeLevelValue,
  Locale,
} from "@kidlearn/types";
import { AI_JOB_TYPES, GRADE_LEVELS, LOCALES } from "@kidlearn/types";
import { Button, cn } from "@kidlearn/ui";
import { ChevronRight, Inbox, SearchX, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminEmptyState } from "@/features/admin/AdminEmptyState";
import { AdminFilterChip } from "@/features/admin/AdminFilterChip";
import { AdminPageHeader } from "@/features/admin/AdminPageHeader";
import { GRADE_LABELS, LOCALE_LABELS } from "@/features/admin/admin-labels";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";
import { type AiJobFilters, fetchAiJobs } from "@/features/admin/ai-api";
import { Chip } from "@/features/admin/StatusChip";
import { AI_JOB_TYPE_LABELS, formatRelativeAge } from "./job-labels";

const PAGE_SIZE = 25;

const STATUS_TABS: Array<{ value: AiJobStatus; label: string }> = [
  { value: "awaiting_review", label: "Awaiting review" },
  { value: "rejected", label: "Rejected" },
  { value: "approved", label: "Approved" },
  { value: "failed", label: "Failed" },
];

export function AiQueueScreen() {
  const [jobs, setJobs] = useState<AiJobSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [isWaking, setIsWaking] = useState(false);
  const [status, setStatus] = useState<AiJobStatus>("awaiting_review");
  const [type, setType] = useState<AiJobType>();
  const [language, setLanguage] = useState<Locale>();
  const [gradeLevel, setGradeLevel] = useState<GradeLevelValue>();

  /** Stops a slow response for stale filters overwriting a fast one for the current filters. */
  const load = useCallback(
    async (isCurrent: () => boolean) => {
      setState("loading");

      const filters: AiJobFilters & { onColdStart: () => void } = {
        status,
        take: PAGE_SIZE,
        onColdStart: () => {
          if (isCurrent()) setIsWaking(true);
        },
        ...(type === undefined ? {} : { type }),
        ...(language === undefined ? {} : { language }),
        ...(gradeLevel === undefined ? {} : { gradeLevel }),
      };

      const result = await fetchAiJobs(filters);
      if (!isCurrent()) return;

      setIsWaking(false);

      if (!result.ok) {
        setState("error");
        return;
      }
      setJobs(result.data.jobs);
      setTotal(result.data.total);
      setState("ready");
    },
    [status, type, language, gradeLevel],
  );

  useEffect(() => {
    let isCurrent = true;
    void load(() => isCurrent);
    return () => {
      isCurrent = false;
    };
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="AI Queue"
        description="Generated content, oldest first. Nothing here is visible to a child until it is approved."
      />

      <div className="flex flex-col gap-2.5 rounded-(--radius) border border-border bg-card p-4">
        <FilterRow label="Status">
          {STATUS_TABS.map((tab) => (
            <AdminFilterChip
              key={tab.value}
              isSelected={status === tab.value}
              onClick={() => setStatus(tab.value)}
            >
              {tab.label}
            </AdminFilterChip>
          ))}
        </FilterRow>

        <FilterRow label="Type">
          <AdminFilterChip
            isSelected={type === undefined}
            onClick={() => setType(undefined)}
          >
            Any
          </AdminFilterChip>
          {AI_JOB_TYPES.map((one) => (
            <AdminFilterChip
              key={one}
              isSelected={type === one}
              onClick={() => setType(one)}
            >
              {AI_JOB_TYPE_LABELS[one]}
            </AdminFilterChip>
          ))}
        </FilterRow>

        <FilterRow label="Language">
          <AdminFilterChip
            isSelected={language === undefined}
            onClick={() => setLanguage(undefined)}
          >
            Any
          </AdminFilterChip>
          {LOCALES.map((one) => (
            <AdminFilterChip
              key={one}
              isSelected={language === one}
              onClick={() => setLanguage(one)}
            >
              {LOCALE_LABELS[one]}
            </AdminFilterChip>
          ))}
        </FilterRow>

        <FilterRow label="Grade">
          <AdminFilterChip
            isSelected={gradeLevel === undefined}
            onClick={() => setGradeLevel(undefined)}
          >
            Any
          </AdminFilterChip>
          {GRADE_LEVELS.map((one) => (
            <AdminFilterChip
              key={one}
              isSelected={gradeLevel === one}
              onClick={() => setGradeLevel(one)}
            >
              {GRADE_LABELS[one]}
            </AdminFilterChip>
          ))}
        </FilterRow>
      </div>

      {state === "loading" ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-muted-foreground text-sm">
            {isWaking ? "Waking the API up…" : "Loading…"}
          </p>
          <RowSkeleton />
        </div>
      ) : state === "error" ? (
        <AdminEmptyState
          tone="error"
          icon={TriangleAlert}
          title="The queue could not be loaded."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load(() => true)}
            >
              Try again
            </Button>
          }
        />
      ) : jobs.length === 0 ? (
        <EmptyState
          status={status}
          isFiltered={
            type !== undefined ||
            language !== undefined ||
            gradeLevel !== undefined
          }
        />
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            Showing {jobs.length} of {total}.
          </p>
          <ul className="flex flex-col gap-2">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobRow job={job} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    // Native `fieldset` carries the grouping without ARIA; border and padding are reset.
    <fieldset className="flex flex-wrap items-center gap-1.5 border-0 p-0">
      {/* `aria-hidden`: the legend already names the group. */}
      <legend className="sr-only">{label}</legend>
      <span
        aria-hidden="true"
        className="w-20 shrink-0 font-medium text-muted-foreground text-xs"
      >
        {label}
      </span>
      {children}
    </fieldset>
  );
}

function JobRow({ job }: { job: AiJobSummary }) {
  return (
    <Link
      href={`${ADMIN_ROUTES.aiQueue}/${job.id}`}
      className={cn(
        "group flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 rounded-(--radius) border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-accent",
        "focus-ring",
      )}
    >
      <Chip>{AI_JOB_TYPE_LABELS[job.type]}</Chip>

      <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
        {job.entityLabel ?? "Nothing was produced"}
      </span>

      {job.gradeLevels.length === 0 ? null : (
        <span className="text-muted-foreground text-xs">
          {job.gradeLevels.map((grade) => GRADE_LABELS[grade]).join(", ")}
        </span>
      )}

      {job.languages.length === 0 ? null : (
        <span className="text-muted-foreground text-xs">
          {job.languages.map((locale) => LOCALE_LABELS[locale]).join(", ")}
        </span>
      )}

      <span className="text-muted-foreground text-xs tabular-nums">
        {formatRelativeAge(job.createdAt)}
      </span>

      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function EmptyState({
  status,
  isFiltered,
}: {
  status: AiJobStatus;
  isFiltered: boolean;
}) {
  if (isFiltered) {
    return (
      <AdminEmptyState
        icon={SearchX}
        title="No jobs match these filters."
        description="Grade and language are read from what each generation was asked for, so a grade filter shows only lessons, stories and quizzes — audio and illustration jobs carry neither."
      />
    );
  }

  return (
    <AdminEmptyState
      icon={Inbox}
      title={
        status === "awaiting_review"
          ? "Nothing is waiting for review."
          : `No ${status.replace("_", " ")} jobs.`
      }
    />
  );
}

function RowSkeleton() {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-2">
      {[0, 1, 2].map((row) => (
        <li
          key={row}
          className="h-14 rounded-(--radius) border border-border bg-card motion-safe:animate-pulse"
        />
      ))}
    </ul>
  );
}
