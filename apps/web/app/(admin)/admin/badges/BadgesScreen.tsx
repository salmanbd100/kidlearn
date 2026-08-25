"use client";

import type { AdminBadge, ContentStatusValue } from "@kidlearn/types";
import { isContentEditable } from "@kidlearn/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kidlearn/ui";
import { useCallback, useEffect, useState } from "react";
import { StatusChip } from "@/app/(admin)/admin/curriculum/StatusChip";
import { TransitionButtons } from "@/app/(admin)/admin/curriculum/TransitionButtons";
import {
  type ContentDraft,
  createBadge,
  fetchBadges,
  transitionEditorContent,
  updateBadge,
} from "@/lib/admin-api";
import { BadgeForm } from "./BadgeForm";

/**
 * `/admin/badges` — the badge manager (FR-GAM-04).
 *
 * **A `draft` badge is authored but inert.** The achievement engine evaluates
 * published badges only, so creating one changes nothing until it is published —
 * and archiving one stops it being awarded without touching the `RewardLedger`
 * rows that recorded the children who already earned it.
 *
 * A published badge refuses an edit, matching every other resource on this
 * surface and for a sharper reason than most: changing a live badge's rule
 * changes, retroactively, what a child had to do to earn it.
 */

type DialogState =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; badge: AdminBadge };

export function BadgesScreen() {
  const [badges, setBadges] = useState<AdminBadge[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [status, setStatus] = useState<
    "loading" | "waking" | "ready" | "error"
  >("loading");
  const [selectedId, setSelectedId] = useState<string>();
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setStatus("loading");
    const result = await fetchBadges({ includeArchived });
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setBadges(result.data);
    setStatus("ready");
  }, [includeArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = badges.find((badge) => badge.id === selectedId);

  async function run(
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
    successNotice: string,
  ): Promise<boolean> {
    setIsBusy(true);
    setNotice(undefined);
    setError(undefined);

    const result = await action();
    if (!result.ok) {
      setError(result.error?.message ?? "That did not work.");
      setIsBusy(false);
      return false;
    }

    await load();
    setNotice(successNotice);
    setIsBusy(false);
    return true;
  }

  async function handleTransition(id: string, hops: ContentStatusValue[]) {
    setIsBusy(true);
    setNotice(undefined);
    setError(undefined);

    for (const to of hops) {
      const result = await transitionEditorContent("badges", id, to);
      if (!result.ok) {
        setError(result.error.message);
        await load();
        setIsBusy(false);
        return;
      }
    }

    await load();
    setNotice(`Moved to ${hops[hops.length - 1].replace("_", " ")}.`);
    setIsBusy(false);
  }

  async function submit(draft: ContentDraft) {
    const succeeded =
      dialog.kind === "edit"
        ? await run(() => updateBadge(dialog.badge.id, draft), "Saved.")
        : await run(() => createBadge(draft), "Created as a draft.");

    if (succeeded) setDialog({ kind: "closed" });
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="font-semibold text-foreground text-xl">Badges</h1>
        <p className="text-muted-foreground text-sm">
          The badges could not be loaded.
        </p>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-semibold text-foreground text-xl">Badges</h1>
          <p className="text-muted-foreground text-xs">
            A badge is earnable only once it is published.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={includeArchived ? "default" : "outline"}
            aria-pressed={includeArchived}
            onClick={() => setIncludeArchived((current) => !current)}
          >
            {includeArchived ? "Hide archived" : "Show archived"}
          </Button>
          <Button
            type="button"
            onClick={() => {
              setNotice(undefined);
              setError(undefined);
              setDialog({ kind: "create" });
            }}
          >
            New badge
          </Button>
        </div>
      </header>

      {notice ? (
        <p
          role="status"
          className="rounded-[var(--radius)] border border-border bg-muted px-3 py-2 text-foreground text-sm"
        >
          {notice}
        </p>
      ) : null}

      {error && dialog.kind === "closed" ? (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-destructive bg-destructive/10 px-3 py-2 text-destructive text-sm"
        >
          {error}
        </p>
      ) : null}

      {status === "loading" ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : badges.length === 0 ? (
        <p className="text-muted-foreground text-sm">No badges yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {badges.map((badge) => (
            <li key={badge.id}>
              <button
                type="button"
                aria-pressed={badge.id === selectedId}
                onClick={() => setSelectedId(badge.id)}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-card p-3 text-left aria-[pressed=true]:border-ring"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium text-card-foreground text-sm">
                    {badge.name}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {describeRule(badge)}
                  </span>
                </span>
                <StatusChip status={badge.status} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-card-foreground text-sm">
                {selected.name}
              </h2>
              <StatusChip status={selected.status} />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!isContentEditable(selected.status) || isBusy}
              onClick={() => {
                setNotice(undefined);
                setError(undefined);
                setDialog({ kind: "edit", badge: selected });
              }}
            >
              Edit
            </Button>
          </div>

          {isContentEditable(selected.status) ? null : (
            <p className="text-muted-foreground text-xs">
              Published badges cannot be edited — changing a live rule would
              change what a child had to do to earn it. Withdraw it to draft
              first.
            </p>
          )}

          <TransitionButtons
            status={selected.status}
            isBusy={isBusy}
            onTransition={(hops) => void handleTransition(selected.id, hops)}
          />
        </section>
      ) : null}

      <Dialog
        open={dialog.kind !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDialog({ kind: "closed" });
        }}
      >
        <DialogContent closeLabel="Close">
          {dialog.kind === "closed" ? null : (
            <>
              <DialogHeader gutter="inset">
                <DialogTitle>
                  {dialog.kind === "create" ? "New badge" : "Edit badge"}
                </DialogTitle>
                <DialogDescription>
                  Saved as a draft. A badge is earnable only once published.
                </DialogDescription>
              </DialogHeader>

              <BadgeForm
                key={dialog.kind === "edit" ? dialog.badge.id : "new"}
                existing={dialog.kind === "edit" ? dialog.badge : undefined}
                isBusy={isBusy}
                error={error}
                onCancel={() => setDialog({ kind: "closed" })}
                onSubmit={(draft) => void submit(draft)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The rule as a sentence, so a list is readable without opening each row. */
function describeRule(badge: AdminBadge): string {
  const rule = badge.rule;
  if ("days" in rule) return `${rule.days}-day learning streak`;
  if ("topicSlug" in rule) {
    const many = rule.count === "all" ? "every" : rule.count;
    return badge.ruleType === "quiz_correct_in_topic"
      ? `${many} quiz questions right in ${rule.topicSlug}`
      : `${many} lesson${many === 1 ? "" : "s"} in ${rule.topicSlug}`;
  }
  return `${rule.count} stories finished`;
}
