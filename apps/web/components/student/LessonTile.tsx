"use client";

import type { LessonListItemResponse } from "@kidlearn/types";
import { Sparkles } from "lucide-react";
import { IconTile } from "@/components/kid/IconTile";

/**
 * One lesson, as a picture a pre-reader can choose (FR-PROF-03).
 *
 * Composed from `IconTile` rather than rebuilt, which is what gets the ordering
 * right for free: the tile speaks its label and calls `onPress` **on the same
 * tap**, and the audio channel outlives the unmount, so the name carries into the
 * lesson that is already loading rather than being cut off by it.
 *
 * Both media fields are contract placeholders today — `thumbnailUrl` and
 * `nameAudioUrl` are reserved `null`s on `LessonListItem` until the content and
 * voice pipelines fill them (files 33/36). Reading them here rather than waiting
 * means attaching real art and a real voice-over is a data change.
 */

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
