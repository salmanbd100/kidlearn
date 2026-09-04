"use client";

import type { ActivityType } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActivityEditor } from "@/components/admin/ActivityEditor";
import { emptyActivityDraft } from "@/components/admin/activity-draft";
import { createActivity } from "@/lib/admin-api";
import { ADMIN_ROUTES } from "@/lib/admin-routes";

/** `/admin/curriculum/activity/new` — authoring an activity from nothing. */
export function NewActivityScreen() {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(payload: {
    type: ActivityType;
    definition: unknown;
  }) {
    setIsBusy(true);
    setError(undefined);

    const result = await createActivity(payload);
    if (!result.ok) {
      setError(result.error.message);
      setIsBusy(false);
      return;
    }

    router.replace(`${ADMIN_ROUTES.curriculum}/activity/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-semibold text-foreground text-xl">
            New activity
          </h1>
          <p className="text-muted-foreground text-xs">
            Saved as a draft. Point a lesson at its id to use it.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link href={ADMIN_ROUTES.curriculum}>Back</Link>
        </Button>
      </header>

      <ActivityEditor
        initial={emptyActivityDraft("drag_drop")}
        isBusy={isBusy}
        error={error}
        onCancel={() => router.push(ADMIN_ROUTES.curriculum)}
        onSubmit={(payload) => void handleSubmit(payload)}
      />
    </div>
  );
}
