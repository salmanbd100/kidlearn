"use client";

import type { LessonListItemResponse } from "@kidlearn/types";
import { Sparkles } from "lucide-react";
import { IconTile } from "@/components/kid/IconTile";

// One lesson, as a picture a pre-reader can choose (FR-PROF-03).

export interface LessonTileProps {
  lesson: LessonListItemResponse;
  onOpen: (lessonId: string) => void;
}

export function LessonTile({ lesson, onOpen }: LessonTileProps) {
  return (
    <IconTile
      label={lesson.title}
      // Decorative stand-in until a thumbnail exists; the title is what carries
      // the meaning and is always visible.
      icon={<Sparkles aria-hidden="true" />}
      imageSrc={lesson.thumbnailUrl ?? undefined}
      audioSrc={lesson.nameAudioUrl ?? undefined}
      size="lg"
      onPress={() => onOpen(lesson.id)}
    />
  );
}
