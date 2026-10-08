"use client";

import type { AdminWorld } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import { Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminEmptyState } from "@/features/admin/AdminEmptyState";
import { AdminPageHeader } from "@/features/admin/AdminPageHeader";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";
import { fetchWorlds } from "@/features/admin/content-api";
import { GenerateStoryDialog } from "./GenerateStoryDialog";
import { StoryMediaPanel } from "./StoryMediaPanel";

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
      <div className="flex flex-col gap-6">
        <AdminPageHeader title="Stories" />
        <AdminEmptyState
          tone="error"
          icon={TriangleAlert}
          title="The worlds could not be loaded, and a story needs one to be set in."
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
        title="Stories"
        description="Generated stories are drafts. They are read and published from the AI Queue."
        actions={
          <Button
            type="button"
            disabled={status === "loading"}
            onClick={() => {
              setNotice(undefined);
              setIsGenerateOpen(true);
            }}
          >
            <Sparkles aria-hidden="true" className="size-4!" />
            Generate a story
          </Button>
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

      <section className="flex flex-col gap-2 rounded-(--radius) border border-border bg-card p-4">
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

      <StoryMediaPanel />

      <GenerateStoryDialog
        isOpen={isGenerateOpen}
        onOpenChange={setIsGenerateOpen}
        worlds={worlds}
        onGenerated={(message) => setNotice(message)}
      />
    </div>
  );
}
