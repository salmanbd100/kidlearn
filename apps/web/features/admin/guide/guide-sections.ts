export interface GuideSectionEntry {
  id: string;
  title: string;
}

/** The contents list and the section ids, in reading order. */
export const GUIDE_SECTIONS = [
  { id: "mental-model", title: "How content fits together" },
  { id: "the-screen", title: "The Curriculum screen" },
  { id: "status-workflow", title: "Status workflow" },
  { id: "child-visibility", title: "What a child can see" },
  { id: "build-a-lesson", title: "Build a lesson by hand" },
  { id: "activities-and-quizzes", title: "Activities and quizzes" },
  { id: "generating-with-ai", title: "Generating with AI" },
  { id: "own-assistant", title: "Use your own AI assistant" },
  { id: "without-gemini", title: "Working without Gemini" },
  { id: "writing-for-kids", title: "Writing for ages 3–6" },
  { id: "troubleshooting", title: "Troubleshooting" },
] as const satisfies readonly GuideSectionEntry[];

export type GuideSectionId = (typeof GUIDE_SECTIONS)[number]["id"];

export const EASE_STANDARD = [0.2, 0, 0, 1] as const;

/** `--dur-base` with `--ease-standard`, or an instant swap under reduced motion. */
export function swapTransition(isMotionReduced: boolean) {
  return { duration: isMotionReduced ? 0 : 0.22, ease: EASE_STANDARD };
}
