"use client";

import { Button, Input, Label } from "@kidlearn/ui";
import { useState } from "react";
import { GenerateNarrationButton } from "@/components/admin/GenerateNarrationButton";
import { generateIllustrations } from "@/lib/admin-api";

/**
 * Narration and illustrations for one generated story (file 36, FR-AI-04,
 * FR-AI-05, FR-AI-09).
 */

/** Loose enough to catch a typo, not a validator — the server owns that. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function StoryMediaPanel() {
  const [storyId, setStoryId] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const isReady = UUID.test(storyId.trim());

  async function handleIllustrate() {
    setIsDrawing(true);
    setNotice(undefined);
    setError(undefined);

    const result = await generateIllustrations(storyId.trim());
    setIsDrawing(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    const { jobIds, skipped, failed } = result.data;
    if (jobIds.length === 0) {
      setNotice(
        skipped === 0
          ? "No page of that story carries a picture brief to draw from."
          : `Nothing to do — all ${skipped} pages already have an illustration or one waiting in the review queue.`,
      );
      return;
    }

    if (failed === jobIds.length) {
      setError(
        `None of the ${jobIds.length} ${jobIds.length === 1 ? "illustration" : "illustrations"} could be drawn — open the AI Queue to see why each one failed.`,
      );
      return;
    }

    const drawn = jobIds.length - failed;
    setNotice(
      `${drawn} ${drawn === 1 ? "illustration" : "illustrations"} drawn${
        failed === 0 ? "" : `, ${failed} failed`
      }${
        skipped === 0 ? "" : `, ${skipped} pages already had one`
      }. Look at them in the AI Queue — nothing is attached to the story until you approve it.`,
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-medium text-foreground text-sm">
          Narration and illustrations
        </h2>
        <p className="text-muted-foreground text-sm">
          Both actions only ever fill in what is missing, and neither attaches
          anything: the clips and pictures land in the AI Queue for you to hear
          and see before a child ever can. Recurring characters are drawn from
          their character sheets, which live on the Media page.
        </p>
      </div>

      <div className="flex max-w-lg flex-col gap-1.5">
        <Label htmlFor="story-media-id">Story id</Label>
        <Input
          id="story-media-id"
          className="font-mono"
          value={storyId}
          spellCheck={false}
          placeholder="00000000-0000-0000-0000-000000000000"
          aria-describedby="story-media-id-hint"
          onChange={(event) => setStoryId(event.target.value)}
        />
        <p id="story-media-id-hint" className="text-muted-foreground text-xs">
          Until the story list arrives with the review queue, take the id from
          the story&rsquo;s generation job in the AI Queue.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <GenerateNarrationButton
          entity="story"
          id={storyId.trim()}
          isBusy={!isReady || isDrawing}
          onGenerated={(message) => {
            setError(undefined);
            setNotice(message);
          }}
          onError={(message) => {
            setNotice(undefined);
            setError(message);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!isReady || isDrawing}
          onClick={() => void handleIllustrate()}
        >
          {isDrawing ? "Drawing — this takes a while…" : "Generate pictures"}
        </Button>
      </div>

      {notice ? (
        <p
          role="status"
          className="rounded-[var(--radius)] border border-border bg-muted px-3 py-2 text-foreground text-sm"
        >
          {notice}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-destructive bg-destructive/10 px-3 py-2 text-destructive text-sm"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
