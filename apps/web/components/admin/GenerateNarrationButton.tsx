"use client";

import type { NarrationEntity } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import { useState } from "react";
import { generateNarration } from "@/lib/admin-api";

/**
 * "Generate narration" — the admin end of the text-to-speech pipeline
 * (file 36, FR-AI-04, FR-I18N-05).
 *
 * **A button with no options, deliberately**, and one shared by the lesson, story
 * and quiz screens rather than three near-copies. The endpoint takes an entity and
 * an id and works out the rest: which locales have text, which of those have no
 * audio yet, and which already have a clip waiting in the review queue. A form
 * offering a language picker would let an admin ask for a Bangla clip on a page
 * with no Bangla text, or re-record one that already exists.
 *
 * **Nothing this produces is audible to a child, and the notice says so.** The
 * clips land as `MediaAsset` rows with no foreign key pointing at them; the
 * attachment happens on approval in the review queue (FR-CMS-05, FR-AI-07). An
 * admin who was not told that would reasonably assume the lesson now speaks.
 *
 * **`skipped` is half the answer.** An eight-page story that produced three clips
 * looks like five failures without it, and the admin's next move — click again —
 * is the wrong one. It covers three reasons at once — already recorded, already in
 * the queue, no text to read — so the notice names all three rather than claiming
 * the clips exist, which is untrue of the third.
 *
 * **`failed` is reported as an error, not folded into the count.** A batch answers
 * `202` even when every clip failed, because the jobs were created and hold their
 * own diagnosis; saying "16 clips recorded" for sixteen failures would send the
 * admin to listen to nothing. A wholly failed batch goes to `onError`.
 *
 * The request is un-retried and can take a long time: sixteen clips is sixteen
 * sequential text-to-speech calls, so the button carries the wait in its label.
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
