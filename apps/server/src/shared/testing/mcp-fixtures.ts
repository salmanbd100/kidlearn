import { validDragAnswer, validMatchPair, validMcq } from "@kidlearn/types";
import type { Curriculum } from "./factories.js";

/** Valid `submit_lesson_draft` arguments against a seeded curriculum. */
export function mcpLessonArgs(
  curriculum: Curriculum,
  overrides: Record<string, unknown> = {},
) {
  return {
    gradeLevel: "KG1",
    subjectId: curriculum.subject.id,
    topicId: curriculum.topic.id,
    worldId: curriculum.world.id,
    lessonFocus: "Counting apples",
    languages: ["en", "bn"],
    lesson: {
      title: { en: "Count the Apples", bn: "আপেল গুনি" },
      learningObjectives: ["Count to three", "Match a number to a group"],
      introScript: { en: "Hello! Let's count.", bn: "হ্যালো! চলো গুনি।" },
      narrationScript: {
        en: "One, two, three apples.",
        bn: "এক, দুই, তিন আপেল।",
      },
      quizQuestions: [validMcq, validMatchPair, validDragAnswer],
    },
    ...overrides,
  };
}

/** Valid `submit_story_draft` arguments: six pages, one character. */
export function mcpStoryArgs(
  curriculum: Curriculum,
  overrides: Record<string, unknown> = {},
) {
  return {
    gradeLevels: ["KG1"],
    theme: "Sharing with friends",
    worldId: curriculum.world.id,
    languages: ["en"],
    story: {
      title: { en: "Bina Shares" },
      moral: { en: "Sharing makes everyone happy." },
      characterDescriptions: [
        {
          name: "Bina",
          kind: "rabbit",
          visualDescription: "A small white rabbit with a red scarf.",
        },
      ],
      pages: Array.from({ length: 6 }, (_, index) => ({
        pageNumber: index + 1,
        text: { en: `Page ${index + 1}.` },
        illustrationPrompt: `Bina the rabbit on page ${index + 1}.`,
      })),
    },
    ...overrides,
  };
}

export function mcpQuizArgs(
  curriculum: Curriculum,
  overrides: Record<string, unknown> = {},
) {
  return {
    lessonId: curriculum.lesson.id,
    languages: ["en", "bn"],
    questions: [validMcq, validMatchPair, validDragAnswer],
    ...overrides,
  };
}
