"use client";

import { cn, useIsMotionReduced } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import {
  BookOpen,
  Globe,
  Layers,
  Library,
  ListChecks,
  type LucideIcon,
  Puzzle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { swapTransition } from "./guide-sections";

type NodeId = "subject" | "topic" | "lesson" | "activity" | "quiz" | "world";

interface TreeNode {
  label: string;
  example: string;
  icon: LucideIcon;
  tag: string;
  where: string;
  points: string[];
}

const NODES: Record<NodeId, TreeNode> = {
  subject: {
    label: "Subject",
    example: "Letters and sounds",
    icon: Library,
    tag: "Grade-tagged",
    where: "Subjects column → New",
    points: [
      "The top of the tree. A child picks a subject first.",
      "Tick every grade that should see anything inside it — a lesson for KG-1 under a subject without KG-1 stays hidden.",
    ],
  },
  topic: {
    label: "Topic",
    example: "Vowels",
    icon: Layers,
    tag: "Grade-tagged",
    where: "Select a subject → Topics column → New",
    points: [
      "Groups lessons inside a subject.",
      "Its grades should be a subset of its subject's.",
    ],
  },
  lesson: {
    label: "Lesson",
    example: "The letter A",
    icon: BookOpen,
    tag: "Grade-tagged · one world",
    where: "Select a topic → Lessons column → New",
    points: [
      "What a child actually plays: a mascot intro, a video, then an optional activity and quiz.",
      "Usually one grade — the writing is pitched at a reading age.",
      "Every child-facing field is written in English and Bangla.",
    ],
  },
  activity: {
    label: "Activity",
    example: "Drag the apple to A",
    icon: Puzzle,
    tag: "Optional · own status",
    where: "Selected lesson → New activity",
    points: [
      "Drag-drop, trace, match or puzzle.",
      "Has its own status — an unpublished activity is silently left out of the lesson.",
    ],
  },
  quiz: {
    label: "Quiz",
    example: "4 questions",
    icon: ListChecks,
    tag: "Optional · own status",
    where: "Selected lesson → Create quiz",
    points: [
      "A few questions after the lesson. Create quiz makes one and links it for you.",
      "Has its own status — publish it from its own page.",
    ],
  },
  world: {
    label: "World",
    example: "Jungle",
    icon: Globe,
    tag: "Theme · all grades",
    where: "Worlds column → New",
    points: [
      "The visual theme and mascot a lesson plays inside. Shared by every grade.",
      "A lesson in an unpublished world is invisible, even when the lesson is published.",
    ],
  },
};

const nodeVariants = cva(
  cn(
    "flex min-h-11 w-full items-center gap-3 rounded-(--radius) border bg-card px-3 py-2 text-left transition-colors sm:w-56",
    "focus-ring",
  ),
  {
    variants: {
      isSelected: {
        true: "border-primary bg-primary/5 shadow-sm",
        false: "border-border hover:bg-accent",
      },
    },
    defaultVariants: { isSelected: false },
  },
);

export function ContentTreeDiagram() {
  const [selected, setSelected] = useState<NodeId>("lesson");
  const isMotionReduced = useIsMotionReduced();
  const detail = NODES[selected];
  const nodeProps = { selected, onSelect: setSelected };

  return (
    <div className="grid gap-5 rounded-(--radius) border border-border bg-card p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
      <div className="flex flex-col">
        <TreeNodeButton id="subject" {...nodeProps} />
        <Stem />
        <TreeNodeButton id="topic" {...nodeProps} />
        <Stem />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <TreeNodeButton id="lesson" {...nodeProps} />
          <span
            aria-hidden="true"
            className="hidden flex-1 items-center gap-2 text-muted-foreground text-xs sm:flex"
          >
            <span className="h-px flex-1 border-border border-t border-dashed" />
            plays in
            <span className="h-px flex-1 border-border border-t border-dashed" />
          </span>
          <span className="pl-4 text-muted-foreground text-xs sm:hidden">
            plays in ↓
          </span>
          <TreeNodeButton id="world" {...nodeProps} />
        </div>
        <div className="ml-6 flex flex-col gap-2 border-border border-l pt-2 pl-6">
          <TreeNodeButton id="activity" {...nodeProps} />
          <TreeNodeButton id="quiz" {...nodeProps} />
        </div>
      </div>

      <div aria-live="polite" className="min-h-48">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: isMotionReduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: isMotionReduced ? 0 : -8 }}
            transition={swapTransition(isMotionReduced)}
            className="flex h-full flex-col gap-3 rounded-(--radius) bg-muted p-4"
          >
            <div className="flex flex-col gap-1">
              <h3 className="font-semibold text-foreground text-base">
                {detail.label}
              </h3>
              <span className="text-muted-foreground text-xs">
                {detail.tag}
              </span>
            </div>
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-foreground text-sm">
              {detail.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <p className="mt-auto text-muted-foreground text-xs">
              <span className="font-medium text-foreground">Where: </span>
              {detail.where}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function TreeNodeButton({
  id,
  selected,
  onSelect,
}: {
  id: NodeId;
  selected: NodeId;
  onSelect: (id: NodeId) => void;
}) {
  const node = NODES[id];
  const Icon = node.icon;
  return (
    <button
      type="button"
      aria-current={selected === id ? "true" : undefined}
      onClick={() => onSelect(id)}
      className={nodeVariants({ isSelected: selected === id })}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius) bg-muted text-primary">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-medium text-foreground text-sm">
          {node.label}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {node.example}
        </span>
      </span>
    </button>
  );
}

function Stem() {
  return <span aria-hidden="true" className="ml-7 h-4 w-px bg-border" />;
}
