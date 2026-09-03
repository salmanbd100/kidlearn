"use client";

import type { AdminWorld } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWorlds } from "@/lib/admin-api";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { GenerateStoryDialog } from "./GenerateStoryDialog";

/**
 * `/admin/stories` — the story section (file 35, FR-AI-02).
 *
 * **This is the generator's entry point and nothing more yet.** Authoring,
 * listing and editing stories arrive with the review queue (file 37, which reuses
 * the file-33 editors for edit-then-approve), so the screen says what it can do
 * and what it cannot rather than showing an empty table that looks broken.
 *
 * It fetches its own data for the reason recorded in `frontend.md §2`: the admin
 * session cookie belongs to the API origin, so a Server Component calling
 * `/api/admin/*` would send no credentials and get a `401`.
 *
 * The worlds list is the one thing the dialog cannot do without — a story's world
 * decides its characters — so a failure to load it is an error state rather than a
 * dialog with an empty select.
 */

export function StoriesScreen() {
  const [worlds, setWorlds] = useState<AdminWorld[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async () => {
    setStatus("loading");
    const result = await fetchWorlds();
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setWorlds(result.data);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="font-semibold text-foreground text-xl">Stories</h1>
        <p className="text-muted-foreground text-sm">
          The worlds could not be loaded, and a story needs one to be set in.
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
          <h1 className="font-semibold text-foreground text-xl">Stories</h1>
          <p className="text-muted-foreground text-xs">
            Generated stories are drafts. They are read and published from the
            AI Queue.
          </p>
        </div>

        <Button
          type="button"
          disabled={status === "loading"}
          onClick={() => {
            setNotice(undefined);
            setIsGenerateOpen(true);
          }}
        >
          Generate a story
        </Button>
      </header>

      {notice ? (
        <p
          role="status"
          className="rounded-[var(--radius)] border border-border bg-muted px-3 py-2 text-foreground text-sm"
        >
          {notice}
        </p>
      ) : null}

      <section className="flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-card p-4">
        <h2 className="font-medium text-foreground text-sm">
          What lands where
        </h2>
        <p className="text-muted-foreground text-sm">
          A generated story arrives as a draft with its pages in order, the text
          in every language you asked for, and a written picture brief per page.
          The illustrations and the narration are produced separately, so a
          fresh draft has neither.
        </p>
        <p className="text-muted-foreground text-sm">
          Read it, edit it and publish it from the{" "}
          <Link className="underline" href={ADMIN_ROUTES.aiQueue}>
            AI Queue
          </Link>
          . Nothing here is visible to a child until it is published.
        </p>
      </section>

      <GenerateStoryDialog
        isOpen={isGenerateOpen}
        onOpenChange={setIsGenerateOpen}
        worlds={worlds}
        onGenerated={(message) => setNotice(message)}
      />
    </div>
  );
}
