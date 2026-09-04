"use client";

import type { NarrationEntity } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import { useState } from "react";
import { generateNarration } from "@/lib/admin-api";

/**
 * "Generate narration" — the admin end of the text-to-speech pipeline
 * (file 36, FR-AI-04, FR-I18N-05).
 */

const ENTITY_NOUN: Record<NarrationEntity, string> = {
  lesson: "lesson",
  story: "story",
  quiz: "quiz",
};

export interface GenerateNarrationButtonProps {
  entity: NarrationEntity;
  id: string;
  isBusy?: boolean;
  onGenerated: (message: string) => void;
  onError: (message: string) => void;
}

export function GenerateNarrationButton({
  entity,
  id,
  isBusy = false,
  onGenerated,
  onError,
}: GenerateNarrationButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleClick() {
    setIsGenerating(true);
    const result = await generateNarration({ entity, id });
    setIsGenerating(false);

    if (!result.ok) {
      onError(result.error.message);
      return;
    }

    const { jobIds, skipped, failed } = result.data;
    const noun = ENTITY_NOUN[entity];

    if (jobIds.length === 0) {
      onGenerated(
        skipped === 0
          ? `This ${noun} has no text to narrate yet.`
          : `Nothing new to narrate for this ${noun} — ${skipped} skipped: already recorded, waiting in the review queue, or no text to read.`,
      );
      return;
    }

    if (failed === jobIds.length) {
      onError(
        `None of the ${jobIds.length} ${jobIds.length === 1 ? "clip" : "clips"} could be recorded — open the AI Queue to see why each one failed.`,
      );
      return;
    }

    const recorded = jobIds.length - failed;
    onGenerated(
      [
        `${recorded} ${recorded === 1 ? "clip" : "clips"} recorded`,
        failed === 0 ? "" : `, ${failed} failed`,
        skipped === 0 ? "" : `, ${skipped} skipped`,
        ". Listen and approve them in the AI Queue — nothing is attached to this ",
        noun,
        " until you do.",
      ].join(""),
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isBusy || isGenerating}
      onClick={() => void handleClick()}
    >
      {isGenerating ? "Recording — this takes a while…" : "Generate narration"}
    </Button>
  );
}
