"use client";

import type { StorySummaryResponse } from "@kidlearn/types";
import { useState } from "react";
import { useAudio } from "@/components/AudioProvider";
import { StoryCard } from "@/components/student/StoryCard";

// The cover grid, and the two-tap rule that opens a story.

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
