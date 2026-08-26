"use client";

import type { ActivityType, AdminActivity } from "@kidlearn/types";
import { isContentEditable } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusChip } from "@/app/(admin)/admin/curriculum/StatusChip";
import { TransitionButtons } from "@/app/(admin)/admin/curriculum/TransitionButtons";
import { ActivityEditor } from "@/components/admin/ActivityEditor";
import {
  type ActivityDraft,
  draftFromActivity,
} from "@/components/admin/activity-draft";
import {
  fetchActivity,
  transitionEditorContent,
  updateActivity,
} from "@/lib/admin-api";
import { ADMIN_ROUTES } from "@/lib/admin-routes";

/**
 * `/admin/curriculum/activity/[activityId]` — one activity's payload (FR-ACT-06).
 *
 * The form is the whole page rather than a dialog, unlike the quiz editor: an
 * activity **is** one payload, so there is no list to sit behind a modal, and the
 * preview wants the room.
 *
 * A published activity is read-only, matching the server. Withdrawing it removes
 * the activity step from any live lesson pointing at it without taking the lesson
 * down — the lesson API omits an unpublished activity rather than failing.
 */
export function ActivityEditorScreen({ activityId }: { activityId: string }) {
  const [activity, setActivity] = useState<AdminActivity>();
  const [draft, setDraft] = useState<ActivityDraft>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    const result = await fetchActivity(activityId);
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setActivity(result.data);
    setDraft(draftFromActivity(result.data.definition));
    setStatus("ready");
  }, [activityId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading") {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (status === "error" || activity === undefined || draft === undefined) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="font-semibold text-foreground text-xl">Activity</h1>
        <p className="text-muted-foreground text-sm">
          That activity could not be loaded.
        </p>
        <Button asChild variant="outline">
          <Link href={ADMIN_ROUTES.curriculum}>Back to curriculum</Link>
        </Button>
      </div>
    );
  }

  const isEditable = isContentEditable(activity.status);

  async function handleSubmit(payload: {
    type: ActivityType;
    definition: unknown;
  }) {
    setIsBusy(true);
    setNotice(undefined);
    setError(undefined);

    const result = await updateActivity(activityId, payload);
    if (!result.ok) {
      setError(result.error.message);
      setIsBusy(false);
      return;
    }

    await load();
    setNotice("Saved.");
    setIsBusy(false);
  }

  async function handleTransition(hops: AdminActivity["status"][]) {
    setIsBusy(true);
    setNotice(undefined);
    setError(undefined);

    for (const to of hops) {
      const result = await transitionEditorContent(
        "activities",
        activityId,
        to,
      );
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

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-foreground text-xl">Activity</h1>
          <StatusChip status={activity.status} />
        </div>
        <Button asChild variant="ghost">
          <Link href={ADMIN_ROUTES.curriculum}>Back</Link>
        </Button>
      </header>

      {isEditable ? null : (
        <p className="text-muted-foreground text-xs">
          This activity is published, so its payload cannot be changed. Withdraw
          it to draft first — lessons pointing at it keep working, without the
          activity step.
        </p>
      )}

      <TransitionButtons
        status={activity.status}
        isBusy={isBusy}
        onTransition={(hops) => void handleTransition(hops)}
      />

      {notice ? (
        <p
          role="status"
          className="rounded-[var(--radius)] border border-border bg-muted px-3 py-2 text-foreground text-sm"
        >
          {notice}
        </p>
      ) : null}

      <ActivityEditor
        // Remounts on a reload so the form starts from what the server stored,
        // rather than from state that predates the save.
        key={activity.updatedAt}
        initial={draft}
        isBusy={isBusy || !isEditable}
        error={error}
        onCancel={() => void load()}
        onSubmit={(payload) => void handleSubmit(payload)}
      />
    </div>
  );
}
