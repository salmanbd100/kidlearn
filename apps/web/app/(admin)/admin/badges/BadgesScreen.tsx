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
import { Award, Plus, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminEmptyState } from "@/features/admin/AdminEmptyState";
import { AdminPageHeader } from "@/features/admin/AdminPageHeader";
import type { ContentDraft } from "@/features/admin/content-api";
import {
  createBadge,
  fetchBadges,
  transitionEditorContent,
  updateBadge,
} from "@/features/admin/editors-api";
import { StatusChip } from "@/features/admin/StatusChip";
import { TransitionButtons } from "@/features/admin/TransitionButtons";
import { BadgeForm } from "./BadgeForm";

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
      <div className="flex flex-col gap-6">
        <AdminPageHeader title="Badges" />
        <AdminEmptyState
          tone="error"
          icon={TriangleAlert}
          title="The badges could not be loaded."
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Badges"
        description="A badge is earnable only once it is published."
        actions={
          <>
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
              <Plus aria-hidden="true" className="size-4!" />
              New badge
            </Button>
          </>
        }
      />

      {notice ? (
        <p
          role="status"
          className="rounded-(--radius) border border-border bg-muted px-3 py-2 text-foreground text-sm"
        >
          {notice}
        </p>
      ) : null}

      {error && dialog.kind === "closed" ? (
        <p
          role="alert"
          className="rounded-(--radius) border border-destructive bg-destructive/10 px-3 py-2 text-destructive text-sm"
        >
          {error}
        </p>
      ) : null}

      {status === "loading" ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : badges.length === 0 ? (
        <AdminEmptyState
          icon={Award}
          title="No badges yet."
          description="Create one, then publish it to make it earnable."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {badges.map((badge) => (
            <li key={badge.id}>
              <button
                type="button"
                aria-pressed={badge.id === selectedId}
                onClick={() => setSelectedId(badge.id)}
                className="flex min-h-14 w-full flex-wrap items-center justify-between gap-3 rounded-(--radius) border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-accent aria-pressed:border-primary aria-pressed:bg-primary/5 focus-ring"
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
        <section className="flex flex-col gap-3 rounded-(--radius) border border-border bg-card p-4">
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
              Badges that are in review, approved or published cannot be edited
              — changing a rule after a decision would change what a child has
              to do to earn it without review. Move it back to draft first.
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
