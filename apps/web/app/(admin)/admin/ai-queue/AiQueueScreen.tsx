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
import { cva } from "class-variance-authority";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Chip } from "@/app/(admin)/admin/curriculum/StatusChip";
import { type AiJobFilters, fetchAiJobs } from "@/lib/admin-api";
import { GRADE_LABELS, LOCALE_LABELS } from "@/lib/admin-labels";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { FOCUS_RING } from "@/lib/focus-ring";
import { AI_JOB_TYPE_LABELS, formatRelativeAge } from "./job-labels";

/**
 * `/admin/ai-queue` — everything a model wrote and nobody has read yet
 * (file 37, FR-CMS-05).
 */

const PAGE_SIZE = 25;

/** The queue proper, then the two archives worth reading back. */
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

  /**
   * `isCurrent` is what stops a slow response for the filters an admin has since
   * moved off from overwriting a fast one for the filters they are looking at —
   * chips reading "Awaiting review" above a list of rejected jobs, which never
   * self-corrects. Every caller passes its own flag; the effect clears it on
   * cleanup, and the manual retry button owns one for the length of its call.
   */
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
      <header className="flex flex-col gap-0.5">
        <h1 className="font-semibold text-foreground text-xl">AI Queue</h1>
        <p className="text-muted-foreground text-xs">
          Generated content, oldest first. Nothing here is visible to a child
          until it is approved.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <FilterRow label="Status">
          {STATUS_TABS.map((tab) => (
            <FilterChip
              key={tab.value}
              isSelected={status === tab.value}
              onClick={() => setStatus(tab.value)}
            >
              {tab.label}
            </FilterChip>
          ))}
        </FilterRow>

        <FilterRow label="Type">
          <FilterChip
            isSelected={type === undefined}
            onClick={() => setType(undefined)}
          >
            Any
          </FilterChip>
          {AI_JOB_TYPES.map((one) => (
            <FilterChip
              key={one}
              isSelected={type === one}
              onClick={() => setType(one)}
            >
              {AI_JOB_TYPE_LABELS[one]}
            </FilterChip>
          ))}
        </FilterRow>

        <FilterRow label="Language">
          <FilterChip
            isSelected={language === undefined}
            onClick={() => setLanguage(undefined)}
          >
            Any
          </FilterChip>
          {LOCALES.map((one) => (
            <FilterChip
              key={one}
              isSelected={language === one}
              onClick={() => setLanguage(one)}
            >
              {LOCALE_LABELS[one]}
            </FilterChip>
          ))}
        </FilterRow>

        <FilterRow label="Grade">
          <FilterChip
            isSelected={gradeLevel === undefined}
            onClick={() => setGradeLevel(undefined)}
          >
            Any
          </FilterChip>
          {GRADE_LEVELS.map((one) => (
            <FilterChip
              key={one}
              isSelected={gradeLevel === one}
              onClick={() => setGradeLevel(one)}
            >
              {GRADE_LABELS[one]}
            </FilterChip>
          ))}
        </FilterRow>
      </div>

      {state === "loading" ? (
        <p className="text-muted-foreground text-sm">
          {isWaking ? "Waking the API up…" : "Loading…"}
        </p>
      ) : state === "error" ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground text-sm">
            The queue could not be loaded.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void load(() => true)}
          >
            Try again
          </Button>
        </div>
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
    // A `fieldset` rather than a `div` with `role="group"`: these are controls,
    // and the native element carries the grouping without an ARIA attribute.
    // Its default border and padding are removed — the grouping is semantic here,
    // not visual.
    <fieldset className="flex flex-wrap items-center gap-1.5 border-0 p-0">
      {/* The visible label is `aria-hidden` because the legend already names the
          group; without that a screen reader announces the axis twice. */}
      <legend className="sr-only">{label}</legend>
      <span
        aria-hidden="true"
        className="w-16 shrink-0 text-muted-foreground text-xs"
      >
        {label}
      </span>
      {children}
    </fieldset>
  );
}

/** 44px on a parent-theme surface (design.md §7). */
const filterChipVariants = cva(
  cn("min-h-11 rounded-full border px-3 text-sm transition-colors", FOCUS_RING),
  {
    variants: {
      isSelected: {
        true: "border-primary bg-primary/10 font-medium text-primary",
        false:
          "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      },
    },
    defaultVariants: { isSelected: false },
  },
);

function FilterChip({
  isSelected,
  onClick,
  children,
}: {
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // `aria-pressed` rather than colour alone — meaning is never carried by
      // colour on its own (design.md §2.3).
      aria-pressed={isSelected}
      onClick={onClick}
      className={filterChipVariants({ isSelected })}
    >
      {children}
    </button>
  );
}

function JobRow({ job }: { job: AiJobSummary }) {
  return (
    <Link
      href={`${ADMIN_ROUTES.aiQueue}/${job.id}`}
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius)] border border-border bg-card p-3 transition-colors hover:bg-accent",
        FOCUS_RING,
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

      <span className="text-muted-foreground text-xs">
        {formatRelativeAge(job.createdAt)}
      </span>
    </Link>
  );
}

/** The empty states differ, and the difference matters. */
function EmptyState({
  status,
  isFiltered,
}: {
  status: AiJobStatus;
  isFiltered: boolean;
}) {
  if (isFiltered) {
    return (
      <p className="text-muted-foreground text-sm">
        No jobs match these filters. Grade and language are read from what each
        generation was asked for, so a grade filter shows only lessons, stories
        and quizzes — audio and illustration jobs carry neither.
      </p>
    );
  }

  return (
    <p className="text-muted-foreground text-sm">
      {status === "awaiting_review"
        ? "Nothing is waiting for review."
        : `No ${status.replace("_", " ")} jobs.`}
    </p>
  );
}
