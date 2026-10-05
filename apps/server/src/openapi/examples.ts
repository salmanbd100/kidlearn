/** Hand-written `2xx` examples; `document.test.ts` parses each against its Zod schema so they cannot drift. */

const CHILD_ID = "clx8k2p9a0001qz7f3m4n5b6c";
const LESSON_ID = "clx8k2p9a0007qz7f9r2t4v8w";
const WORLD_ID = "clx8k2p9a0004qz7f6h8j1k3l";

export const CHILD_PROFILE_LIST_EXAMPLE = {
  data: [
    {
      id: CHILD_ID,
      firstName: "Ayaan",
      age: 5,
      gradeLevel: "KG1",
      preferredLanguage: "en",
      avatarCharacterId: "clx8k2p9a0002qz7f4n5b6c7d",
      createdAt: "2026-02-11T09:14:22.301Z",
      stats: { stars: 148, coins: 62, badges: 4, currentStreak: 3 },
    },
    {
      id: "clx8k2p9a0003qz7f5b6c7d8e",
      firstName: "Nusrat",
      age: 4,
      gradeLevel: "NURSERY",
      preferredLanguage: "bn",
      // Nullable is the common case: created before the avatar picker, or skipped at onboarding.
      avatarCharacterId: null,
      createdAt: "2026-04-02T17:48:05.117Z",
      stats: { stars: 22, coins: 9, badges: 0, currentStreak: 0 },
    },
  ],
};

export const WORLD_LIST_EXAMPLE = {
  data: {
    worlds: [
      {
        id: WORLD_ID,
        slug: "jungle",
        name: "Jungle",
        palette: {
          primary: "#2F8F5B",
          secondary: "#F2C14E",
          background: "#EAF7EF",
        },
        mascot: {
          id: "clx8k2p9a0005qz7f7j9k2l4m",
          url: "https://res.cloudinary.com/kidlearn/image/upload/v1770000000/worlds/jungle-mascot.png",
          kind: "image",
        },
      },
      {
        id: "clx8k2p9a0006qz7f8k1l3m5n",
        slug: "ocean",
        name: "Ocean",
        palette: {
          primary: "#1E6FA8",
          secondary: "#7FD4E8",
          background: "#E8F4FA",
        },
        // Artwork not landed yet; the client draws a placeholder keyed on `slug`.
        mascot: null,
      },
    ],
  },
};

export const LESSON_DETAIL_EXAMPLE = {
  data: {
    lesson: {
      id: LESSON_ID,
      slug: "count-to-five",
      // Already resolved to the active child's language; no `translations` object on student reads.
      title: "Count to Five",
      worldId: WORLD_ID,
      world: {
        id: WORLD_ID,
        slug: "jungle",
        name: "Jungle",
        palette: {
          primary: "#2F8F5B",
          secondary: "#F2C14E",
          background: "#EAF7EF",
        },
        mascot: {
          id: "clx8k2p9a0005qz7f7j9k2l4m",
          url: "https://res.cloudinary.com/kidlearn/image/upload/v1770000000/worlds/jungle-mascot.png",
          kind: "image",
        },
      },
      locale: "en",
      introScript: "Let's count the parrots together!",
      introAudioUrl:
        "https://res.cloudinary.com/kidlearn/video/upload/v1770000000/lessons/count-to-five-intro-en.mp3",
      videoUrl:
        "https://res.cloudinary.com/kidlearn/video/upload/v1770000000/lessons/count-to-five-en.mp4",
      videoPosterUrl: null,
      // `true` means the URL fell back to English because the child's language has no asset yet.
      assetFallbacks: {
        introAudioUrl: false,
        videoUrl: false,
        videoPosterUrl: false,
      },
      activity: {
        id: "clx8k2p9a0008qz7f1s3u5w9x",
        type: "drag_drop",
        schemaVersion: 1,
        definition: {
          schemaVersion: 1,
          type: "drag_drop",
          instructionAudio: {
            en: {
              kind: "audio",
              url: "https://res.cloudinary.com/kidlearn/video/upload/v1770000000/activities/count-drag-en.mp3",
            },
            bn: {
              kind: "audio",
              url: "https://res.cloudinary.com/kidlearn/video/upload/v1770000000/activities/count-drag-bn.mp3",
            },
          },
          items: [
            {
              id: "item-3",
              label: { en: "Three", bn: "তিন" },
              image: {
                kind: "image",
                url: "https://res.cloudinary.com/kidlearn/image/upload/v1770000000/numerals/3.png",
              },
            },
            {
              id: "item-5",
              label: { en: "Five", bn: "পাঁচ" },
              image: {
                kind: "image",
                url: "https://res.cloudinary.com/kidlearn/image/upload/v1770000000/numerals/5.png",
              },
            },
          ],
          targets: [
            {
              id: "target-3",
              label: { en: "Three parrots", bn: "তিনটি টিয়া" },
              image: {
                kind: "image",
                url: "https://res.cloudinary.com/kidlearn/image/upload/v1770000000/jungle/parrots-3.png",
              },
            },
            {
              id: "target-5",
              label: { en: "Five parrots", bn: "পাঁচটি টিয়া" },
              image: {
                kind: "image",
                url: "https://res.cloudinary.com/kidlearn/image/upload/v1770000000/jungle/parrots-5.png",
              },
            },
          ],
          correctMappings: [
            { itemId: "item-3", targetId: "target-3" },
            { itemId: "item-5", targetId: "target-5" },
          ],
        },
      },
      quiz: {
        id: "clx8k2p9a0009qz7f2t4v6x1y",
        title: "How many?",
        questions: [
          {
            id: "clx8k2p9a0010qz7f3u5w7y2z",
            format: "mcq",
            schemaVersion: 1,
            sortOrder: 0,
            definition: {
              schemaVersion: 1,
              type: "mcq",
              prompt: {
                en: "How many parrots are on the branch?",
                bn: "ডালে কয়টি টিয়া আছে?",
              },
              promptAudio: {
                en: {
                  kind: "audio",
                  url: "https://res.cloudinary.com/kidlearn/video/upload/v1770000000/quizzes/how-many-en.mp3",
                },
                bn: {
                  kind: "audio",
                  url: "https://res.cloudinary.com/kidlearn/video/upload/v1770000000/quizzes/how-many-bn.mp3",
                },
              },
              // Three to four, never two: `.min(3).max(4)` is a refinement, invisible in the rendered schema.
              options: [
                { id: "opt-3", text: { en: "3", bn: "৩" } },
                { id: "opt-4", text: { en: "4", bn: "৪" } },
                { id: "opt-5", text: { en: "5", bn: "৫" } },
              ],
              correctOptionId: "opt-5",
            },
          },
        ],
      },
      // Always `null` on this read; per-child progress comes from `GET /api/progress/lessons/{id}`.
      progress: null,
    },
  },
};

export const LESSON_COMPLETION_EXAMPLE = {
  data: {
    starsEarned: 3,
    coinsEarned: 5,
    newBadges: [
      {
        id: "clx8k2p9a0011qz7f4v6x8z3a",
        slug: "first-five",
        name: "First Five",
        iconUrl:
          "https://res.cloudinary.com/kidlearn/image/upload/v1770000000/badges/first-five.png",
      },
    ],
    // Empty on almost every completion; a character unlock is a milestone.
    newCharacters: [],
    streak: { current: 4, milestone: null },
    totals: { stars: 151, coins: 67 },
  },
};

export const DASHBOARD_SUMMARY_EXAMPLE = {
  data: {
    learningMinutes: { today: 18, week: 96, month: 342 },
    subjects: [
      {
        subjectId: "clx8k2p9a0012qz7f5w7y9a4b",
        slug: "numbers",
        // Both locales, unlike other localised responses: the reader is the parent, whose language the server never sees.
        name: { en: "Numbers", bn: "সংখ্যা" },
        completed: 12,
        total: 20,
        percent: 60,
      },
      {
        subjectId: "clx8k2p9a0013qz7f6x8z1b5c",
        slug: "letters",
        name: { en: "Letters", bn: null },
        completed: 3,
        total: 18,
        percent: 17,
      },
    ],
    strongestSubjectId: "clx8k2p9a0012qz7f5w7y9a4b",
    weakestSubjectId: "clx8k2p9a0013qz7f6x8z1b5c",
    recentActivity: [
      {
        type: "lesson_completed",
        refId: LESSON_ID,
        title: { en: "Count to Five", bn: "পাঁচ পর্যন্ত গোনা" },
        occurredAt: "2026-09-05T16:22:41.882Z",
      },
      {
        type: "badge_earned",
        refId: "clx8k2p9a0011qz7f4v6x8z3a",
        title: { en: "First Five", bn: "প্রথম পাঁচ" },
        occurredAt: "2026-09-05T16:22:41.905Z",
      },
    ],
  },
};

export const AI_JOB_LIST_EXAMPLE = {
  data: {
    jobs: [
      {
        id: "clx8k2p9a0014qz7f7y9a2c6d",
        type: "lesson",
        status: "awaiting_review",
        decision: null,
        gradeLevels: ["KG1"],
        languages: ["en", "bn"],
        entityLabel: "Count to Ten",
        createdAt: "2026-09-05T11:03:17.442Z",
        reviewedAt: null,
      },
      {
        id: "clx8k2p9a0015qz7f8z1b3d7e",
        type: "image",
        status: "approved",
        decision: "edit_then_approve",
        gradeLevels: ["NURSERY", "KG1"],
        languages: ["en"],
        // Null where the generated row was deleted, or for a batch naming no single entity.
        entityLabel: null,
        createdAt: "2026-09-04T08:41:52.010Z",
        reviewedAt: "2026-09-04T14:19:33.774Z",
      },
    ],
    total: 2,
  },
};

const PARENT_ID = "clx8k2p9a0000qz7f2l3m4n5b";
const STORY_ID = "clx8k2p9a0016qz7f9a2c4e8f";
const TOPIC_ID = "clx8k2p9a0017qz7f1b3d5f9g";

export const AUTH_ME_EXAMPLE = {
  data: {
    parent: {
      id: PARENT_ID,
      email: "rumana.hoque@example.com",
      // Google may withhold either, so a client needs a fallback for each.
      name: "Rumana Hoque",
      avatarUrl:
        "https://lh3.googleusercontent.com/a/ACg8ocKq1x2v3w4y5z6a7b8c9d0e1f2g3h4i5j6=s96-c",
      consentGivenAt: "2026-02-11T09:02:44.118Z",
    },
    // Null until `POST /api/children/{id}/activate`; `/api/content/*` answers 403 while it is.
    activeChildProfileId: CHILD_ID,
  },
};

export const SCREEN_TIME_STATUS_EXAMPLE = {
  data: {
    // `allowed: false` always carries a `reason`; `reason` is null whenever `allowed` is true.
    allowed: false,
    reason: "TIME_LIMIT_REACHED",
    minutesToday: 45,
    dailyLimitMinutes: 45,
    // `HH:MM` in the household's local time; both null when no window is set, leaving only the daily limit.
    windowStart: "16:00",
    windowEnd: "19:30",
  },
};

export const WORLD_LESSONS_EXAMPLE = {
  data: {
    topics: [
      {
        id: TOPIC_ID,
        slug: "counting",
        name: "Counting",
        sortOrder: 0,
        lessons: [
          {
            id: LESSON_ID,
            slug: "count-to-five",
            title: "Count to Five",
            worldId: WORLD_ID,
            sortOrder: 0,
            thumbnailUrl:
              "https://res.cloudinary.com/kidlearn/image/upload/v1770000000/lessons/count-to-five-thumb.png",
            durationEstimateSec: 240,
            nameAudioUrl:
              "https://res.cloudinary.com/kidlearn/video/upload/v1770000000/lessons/count-to-five-name-en.mp3",
            // Always `null` on browse reads; per-child progress comes from `GET /api/progress/lessons/{id}`.
            progress: null,
          },
          {
            id: "clx8k2p9a0018qz7f2c4e6g1h",
            slug: "count-to-ten",
            title: "Count to Ten",
            worldId: WORLD_ID,
            sortOrder: 1,
            // Authored without artwork or a duration yet; not a reason to hide the row.
            thumbnailUrl: null,
            durationEstimateSec: null,
            nameAudioUrl: null,
            progress: null,
          },
        ],
      },
      {
        id: "clx8k2p9a0019qz7f3d5f7h2i",
        slug: "shapes",
        name: "Shapes",
        sortOrder: 1,
        // Returned empty rather than omitted so the world's shape stays stable as content lands.
        lessons: [],
      },
    ],
  },
};

export const STORY_DETAIL_EXAMPLE = {
  data: {
    story: {
      id: STORY_ID,
      slug: "the-lost-parrot",
      title: "The Lost Parrot",
      moral: "Ask for help when you are lost.",
      moralAudioUrl:
        "https://res.cloudinary.com/kidlearn/video/upload/v1770000000/stories/lost-parrot-moral-en.mp3",
      world: {
        id: WORLD_ID,
        slug: "jungle",
        name: "Jungle",
        palette: {
          primary: "#2F8F5B",
          secondary: "#F2C14E",
          background: "#EAF7EF",
        },
        mascot: {
          id: "clx8k2p9a0005qz7f7j9k2l4m",
          url: "https://res.cloudinary.com/kidlearn/image/upload/v1770000000/worlds/jungle-mascot.png",
          kind: "image",
        },
      },
      coverImageUrl:
        "https://res.cloudinary.com/kidlearn/image/upload/v1770000000/stories/lost-parrot-cover.png",
      locale: "en",
      pages: [
        {
          // 1-based and contiguous; already ordered by the server.
          pageNumber: 1,
          illustrationUrl:
            "https://res.cloudinary.com/kidlearn/image/upload/v1770000000/stories/lost-parrot-p1.png",
          text: "Popo the parrot flew too far from home.",
          narrationUrl:
            "https://res.cloudinary.com/kidlearn/video/upload/v1770000000/stories/lost-parrot-p1-en.mp3",
          // `start`/`end` are character offsets into `text`; `tMs` is the ms into `narrationUrl` where the span is spoken.
          narrationTimings: {
            unit: "word",
            spans: [
              { start: 0, end: 4, tMs: 0 },
              { start: 5, end: 8, tMs: 420 },
              { start: 9, end: 15, tMs: 760 },
            ],
          },
        },
        {
          pageNumber: 2,
          illustrationUrl: null,
          text: "He asked the monkeys for help.",
          narrationUrl:
            "https://res.cloudinary.com/kidlearn/video/upload/v1770000000/stories/lost-parrot-p2-en.mp3",
          // Narration exists but was never timed; the player falls back to plain playback.
          narrationTimings: null,
        },
      ],
      // Unlike a lesson, a story carries the active child's completion here (a single boolean).
      completed: false,
    },
  },
};

export const LESSON_PROGRESS_READ_EXAMPLE = {
  data: {
    // `null`, not a 404, when the child has never opened this lesson.
    progress: {
      lessonId: LESSON_ID,
      // Where to resume: the step not yet finished.
      currentStep: "quiz",
      // Non-null only once the whole lesson is done.
      completedAt: null,
    },
  },
};

export const QUIZ_RESPONSES_EXAMPLE = {
  data: {
    lessonId: LESSON_ID,
    // A percentage (0-100), rounded, so 2/3 is 67.
    score: 67,
    correctCount: 2,
    totalQuestions: 3,
  },
};

export const WEEKLY_REPORT_LIST_EXAMPLE = {
  data: {
    reports: [
      {
        weekStart: "2026-08-31T00:00:00.000Z",
        weekEnd: "2026-09-06T23:59:59.999Z",
        metrics: {
          activeDays: 5,
          learningMinutes: 96,
          newLetters: ["ক", "খ"],
          newWords: ["cat", "sun"],
          newNumbers: ["4", "5"],
          lessonsCompleted: 7,
          storiesCompleted: 2,
          // Null when no quizzes were answered that week; distinct from `0`.
          quizAccuracy: 82,
          quizFirstAttempts: 11,
          quizFirstAttemptsCorrect: 9,
          badgesEarned: [{ slug: "first-five", name: "First Five" }],
          // An i18n key plus interpolation values, never a built sentence; `note` is an English fallback only.
          noteKey: "strongWeek",
          noteParams: { days: 5, lessons: 7 },
        },
        note: "A strong week — 5 active days and 7 lessons finished.",
        createdAt: "2026-09-07T02:00:11.507Z",
      },
    ],
  },
};
