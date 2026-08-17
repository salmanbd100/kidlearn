"use client";

import type { StorySummaryResponse } from "@kidlearn/types";
import { useState } from "react";
import { useAudio } from "@/components/AudioProvider";
import { StoryCard } from "@/components/student/StoryCard";

/**
 * The cover grid, and the two-tap rule that opens a story.
 *
 * **First tap hears, second tap opens.** A three-year-old cannot read a cover, so
 * the first tap reads the title aloud and marks the card; only a second tap on the
 * *same* card opens it. Tapping a different cover moves the selection and reads
 * that title instead. This is what makes a library browsable by a pre-reader —
 * without it, finding the story they wanted means opening and backing out of every
 * other one.
 *
 * It differs from the lesson tiles in file 15 on purpose: there, a tile speaks and
 * navigates on the same tap, because a lesson tile sits under a topic heading a
 * child arrived at deliberately and there is only one thing it can be. A library is
 * a shelf of twenty covers being browsed.
 *
 * A story with no title recording opens on the first tap. Requiring a second tap
 * to confirm something the child was never told would be a door that needs two
 * pushes for no reason — and the missing narration is the placeholder state until
 * the voice pipeline (file 36) fills `titleAudioUrl`.
 */

export interface StoryGridProps {
  stories: StorySummaryResponse[];
  onOpen: (storyId: string) => void;
}

export function StoryGrid({ stories, onOpen }: StoryGridProps) {
  const { play } = useAudio();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  function handleCardPress(story: StorySummaryResponse) {
    if (selectedId === story.id || story.titleAudioUrl === null) {
      onOpen(story.id);
      return;
    }
    setSelectedId(story.id);
    // `interrupt` defaults to true, which is what makes a second cover cut off
    // the first rather than queue behind it.
    void play(story.titleAudioUrl);
  }

  return (
    // Two up on the narrowest phone, wider as soon as there is room for it — a
    // cover stays well above the 64px touch minimum at every step (design.md §6).
    <ul className="grid grid-cols-2 gap-4 landscape:grid-cols-3 sm:grid-cols-3 lg:grid-cols-4">
      {stories.map((story) => (
        <li key={story.id} className="contents">
          <StoryCard
            story={story}
            isSelected={selectedId === story.id}
            onPress={() => handleCardPress(story)}
          />
        </li>
      ))}
    </ul>
  );
}
