import { validDragDrop, validMcq, validPictureSelect } from "@kidlearn/types";
import { type Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEV_PARENT_EMAIL = "dev-parent@kidlearn.local";
/** Fixed id so re-seeding is idempotent; better-auth uses opaque string ids. */
const DEV_PARENT_USER_ID = "dev-user-parent";

/**
 * `@kidlearn/types` fixtures are typed as the interfaces Zod infers, which do
 * not carry the index signature Prisma's `InputJsonValue` requires. Round-
 * tripping through `JSON.stringify` produces the same value with a type the
 * driver accepts — a real conversion at a verified boundary, not a cast that
 * asserts something untrue.
 */
function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function main() {
  // File 09 — every Parent hangs off a better-auth `user` row. This fixture has
  // no `account` row on purpose, so it cannot sign in: real parents get their
  // identity from the Google callback. It exists only to satisfy the FK for
  // local development and to give the child-profile fixtures an owner.
  const devUser = await prisma.user.upsert({
    where: { id: DEV_PARENT_USER_ID },
    update: {},
    create: {
      id: DEV_PARENT_USER_ID,
      email: DEV_PARENT_EMAIL,
      name: "Dev Parent",
      emailVerified: true,
    },
  });

  const parent = await prisma.parent.upsert({
    where: { email: DEV_PARENT_EMAIL },
    update: {},
    create: {
      userId: devUser.id,
      googleId: "dev-google-id",
      email: DEV_PARENT_EMAIL,
      name: "Dev Parent",
      consentGivenAt: new Date(),
      consentVersion: "dev-1",
    },
  });

  await prisma.childProfile.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      firstName: "Ava",
      age: 4,
      gradeLevel: "NURSERY",
      preferredLanguage: "en",
      parentId: parent.id,
    },
  });

  const jungle = await prisma.world.upsert({
    where: { slug: "jungle" },
    update: {},
    create: {
      slug: "jungle",
      name: "Jungle World",
      status: "published",
      palette: { primary: "#2E7D32", secondary: "#FDD835", bg: "#E8F5E9" },
    },
  });

  await prisma.world.upsert({
    where: { slug: "ocean" },
    update: {},
    create: {
      slug: "ocean",
      name: "Ocean World",
      status: "published",
      palette: { primary: "#0277BD", secondary: "#80DEEA", bg: "#E1F5FE" },
    },
  });

  const language = await prisma.subject.upsert({
    where: { slug: "language" },
    update: {},
    create: {
      slug: "language",
      name: "Language",
      sortOrder: 1,
      gradeLevels: ["NURSERY", "KG1"],
      status: "published",
    },
  });

  await prisma.subject.upsert({
    where: { slug: "mathematics" },
    update: {},
    create: {
      slug: "mathematics",
      name: "Mathematics",
      sortOrder: 2,
      gradeLevels: ["NURSERY", "KG1"],
      status: "published",
    },
  });

  await prisma.subject.upsert({
    where: { slug: "science" },
    update: {},
    create: {
      slug: "science",
      name: "Science",
      sortOrder: 3,
      gradeLevels: ["NURSERY", "KG1"],
      status: "published",
    },
  });

  await prisma.subject.upsert({
    where: { slug: "social-skills" },
    update: {},
    create: {
      slug: "social-skills",
      name: "Social Skills",
      sortOrder: 4,
      gradeLevels: ["NURSERY", "KG1"],
      status: "published",
    },
  });

  const alphabet = await prisma.topic.upsert({
    where: { subjectId_slug: { subjectId: language.id, slug: "alphabet" } },
    update: {},
    create: {
      slug: "alphabet",
      name: "Alphabet",
      sortOrder: 1,
      gradeLevels: ["NURSERY", "KG1"],
      status: "published",
      subjectId: language.id,
    },
  });

  const lessonA = await prisma.lesson.upsert({
    where: { topicId_slug: { topicId: alphabet.id, slug: "letter-a" } },
    update: {},
    create: {
      slug: "letter-a",
      title: "Letter A",
      sortOrder: 1,
      gradeLevels: ["NURSERY", "KG1"],
      status: "draft",
      topicId: alphabet.id,
      worldId: jungle.id,
    },
  });

  await prisma.lessonTranslation.upsert({
    where: { lessonId_language: { lessonId: lessonA.id, language: "en" } },
    update: {},
    create: {
      lessonId: lessonA.id,
      language: "en",
      introScript: "Hello! Today we are going to learn about the letter A!",
    },
  });

  // File 05 — Activity, Quiz & Story seed data

  // 1. One drag-drop Activity with the exact-shaped definition
  const letterAActivity = await prisma.activity.upsert({
    where: { id: "00000000-0000-0000-0000-000000000101" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000101",
      type: "drag_drop",
      status: "published",
      definition: {
        version: 1,
        prompt: "Match the letter!",
        items: [
          {
            id: "apple",
            imageUrl: "https://placehold.co/200x200?text=Apple",
            target: "A",
          },
        ],
        targets: [{ id: "A", label: "A" }],
      },
    },
  });

  // 2. One Quiz with 3 mcq/picture_select questions, sortOrder 1–3.
  const letterAQuiz = await prisma.quiz.upsert({
    where: { id: "00000000-0000-0000-0000-000000000201" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000201",
      title: "Letter A Quiz",
      status: "published",
    },
  });

  // Question 1 — mcq: which letter is this?
  await prisma.quizQuestion.upsert({
    where: { id: "00000000-0000-0000-0000-000000000202" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000202",
      quizId: letterAQuiz.id,
      format: "mcq",
      sortOrder: 1,
      definition: {
        version: 1,
        prompt: "Which letter is this?",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        correctOptionId: "a",
      },
    },
  });

  // Question 2 — picture_select: pick the picture starting with A
  await prisma.quizQuestion.upsert({
    where: { id: "00000000-0000-0000-0000-000000000203" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000203",
      quizId: letterAQuiz.id,
      format: "picture_select",
      sortOrder: 2,
      definition: {
        version: 1,
        prompt: "Select the picture that starts with A",
        options: [
          { id: "apple", imageUrl: "https://placehold.co/200x200?text=Apple" },
          { id: "ball", imageUrl: "https://placehold.co/200x200?text=Ball" },
        ],
        correctOptionId: "apple",
      },
    },
  });

  // Question 3 — mcq: what sound does the letter 'A' make?
  await prisma.quizQuestion.upsert({
    where: { id: "00000000-0000-0000-0000-000000000204" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000204",
      quizId: letterAQuiz.id,
      format: "mcq",
      sortOrder: 3,
      definition: {
        version: 1,
        prompt: "What sound does the letter 'A' make?",
        options: [
          { id: "apple", label: "Apple" },
          { id: "cat", label: "cat" },
        ],
        correctOptionId: "apple",
      },
    },
  });

  // 3. Write the Activity + Quiz onto the existing seeded letter-a lesson via update.
  await prisma.lesson.update({
    where: { id: lessonA.id },
    data: {
      activityId: letterAActivity.id,
      quizId: letterAQuiz.id,
    },
  });

  //    2 pages, each with en + bn StoryPageTranslation rows.

  const sharingMonkeyStory = await prisma.story.upsert({
    where: { slug: "the-sharing-monkey" },
    update: {},
    create: {
      slug: "the-sharing-monkey",
      title: "The Sharing Monkey",
      theme: "sharing",
      status: "published",
      worldId: jungle.id,
      gradeLevels: ["NURSERY", "KG1"],
    },
  });

  // Page 1
  const storyPage1 = await prisma.storyPage.upsert({
    where: { id: "00000000-0000-0000-0000-000000000301" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000301",
      storyId: sharingMonkeyStory.id,
      sortOrder: 1,
    },
  });

  await prisma.storyPageTranslation.upsert({
    where: {
      storyPageId_language: { storyPageId: storyPage1.id, language: "en" },
    },
    update: {},
    create: {
      storyPageId: storyPage1.id,
      language: "en",
      text: "Momo the monkey found a big juicy mango.",
    },
  });

  await prisma.storyPageTranslation.upsert({
    where: {
      storyPageId_language: { storyPageId: storyPage1.id, language: "bn" },
    },
    update: {},
    create: {
      storyPageId: storyPage1.id,
      language: "bn",
      text: "মোমো বানর একটা বড় রসালো আম খুঁজে পেল।",
    },
  });

  // Page 2
  const storyPage2 = await prisma.storyPage.upsert({
    where: { id: "00000000-0000-0000-0000-000000000302" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000302",
      storyId: sharingMonkeyStory.id,
      sortOrder: 2,
    },
  });

  await prisma.storyPageTranslation.upsert({
    where: {
      storyPageId_language: { storyPageId: storyPage2.id, language: "en" },
    },
    update: {},
    create: {
      storyPageId: storyPage2.id,
      language: "en",
      text: "Momo shared the mango with all his friends.",
    },
  });

  await prisma.storyPageTranslation.upsert({
    where: {
      storyPageId_language: { storyPageId: storyPage2.id, language: "bn" },
    },
    update: {},
    create: {
      storyPageId: storyPage2.id,
      language: "bn",
      text: "মোমো তার সব বন্ধুদের সাথে আমটা ভাগ করে খেল।",
    },
  });

  //------------part-6-----------
  // ---------- Default Character ----------
  const characterLion = await prisma.character.upsert({
    where: { slug: "leo-the-lion" },
    update: {},
    create: {
      slug: "leo-the-lion",
      name: "Leo the Lion",
      isDefault: true,
      status: "published",
      unlockRule: {},
    },
  });

  // ---------- Starter avatar set (file 14) ----------
  // The child-profile form offers every published `isDefault` character, so one
  // seeded character meant a picker with a single option and no real choice
  // (FR-PROF-02). These five join Leo to make the six-avatar starter set.
  //
  // `unlockRule: {}` marks "no rule — available from the start", the same as
  // Leo's. Characters that must be *earned* carry a real rule and
  // `isDefault: false`; those arrive with the unlock mechanics in file 24.
  //
  // No `assetId`: the illustrated character sheet comes from the content
  // pipeline (design.md §9) and does not exist yet. `GET /api/characters` reports
  // `imageUrl: null` and the web picker draws a placeholder keyed on the slug,
  // so attaching real artwork later is a data change and nothing more.
  const STARTER_CHARACTERS = [
    { slug: "ellie-the-elephant", name: "Ellie the Elephant" },
    { slug: "tara-the-turtle", name: "Tara the Turtle" },
    { slug: "bella-the-butterfly", name: "Bella the Butterfly" },
    { slug: "dara-the-dolphin", name: "Dara the Dolphin" },
    { slug: "ollie-the-owl", name: "Ollie the Owl" },
  ];

  for (const { slug, name } of STARTER_CHARACTERS) {
    await prisma.character.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        name,
        isDefault: true,
        status: "published",
        unlockRule: {},
      },
    });
  }

  // ---------- Six FR-GAM-04 Badges ----------
  await prisma.badge.upsert({
    where: { slug: "alphabet-hero" },
    update: {},
    create: {
      slug: "alphabet-hero",
      name: "Alphabet Hero",
      description: "Complete all letters in the Alphabet topic",
      ruleType: "lessons_completed_in_topic",
      rule: { topicSlug: "alphabet", count: 26 },
      status: "published",
    },
  });

  await prisma.badge.upsert({
    where: { slug: "math-champion" },
    update: {},
    create: {
      slug: "math-champion",
      name: "Math Champion",
      description: "Complete all lessons in Mathematics",
      ruleType: "lessons_completed_in_subject",
      rule: { subjectSlug: "mathematics", count: 20 },
      status: "published",
    },
  });

  await prisma.badge.upsert({
    where: { slug: "reading-star" },
    update: {},
    create: {
      slug: "reading-star",
      name: "Reading Star",
      description: "Finish 10 stories",
      ruleType: "stories_completed",
      rule: { count: 10 },
      status: "published",
    },
  });

  await prisma.badge.upsert({
    where: { slug: "animal-expert" },
    update: {},
    create: {
      slug: "animal-expert",
      name: "Animal Expert",
      description: "Complete all lessons in Science",
      ruleType: "lessons_completed_in_subject",
      rule: { subjectSlug: "science", count: 15 },
      status: "published",
    },
  });

  await prisma.badge.upsert({
    where: { slug: "streak-starter" },
    update: {},
    create: {
      slug: "streak-starter",
      name: "Streak Starter",
      description: "Learn 3 days in a row",
      ruleType: "streak_days",
      rule: { days: 3 },
      status: "published",
    },
  });

  await prisma.badge.upsert({
    where: { slug: "week-warrior" },
    update: {},
    create: {
      slug: "week-warrior",
      name: "Week Warrior",
      description: "Learn 7 days in a row",
      ruleType: "streak_days",
      rule: { days: 7 },
      status: "published",
    },
  });

  // ---------- Assign Default Character to Child Profile ----------
  const ChildProfileUpdate = await prisma.childProfile.update({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    data: { avatarCharacterId: characterLion.id },
  });
  await prisma.childCharacter.upsert({
    where: {
      childId_characterId: {
        childId: ChildProfileUpdate.id,
        characterId: characterLion.id,
      },
    },
    update: {},
    create: {
      childId: ChildProfileUpdate.id,
      characterId: characterLion.id,
    },
  });

  //------------part-12 · curriculum content read API fixtures-----------------
  // Developer scaffolding for `GET /api/content/*` and for the frontend files
  // 15–22. Everything below is upserted on a stable id or slug, so running the
  // seed twice changes no row count.
  //
  // Deliberate status spread — the leak-proof tests and manual smoke checks
  // need content that must NOT be visible:
  //   letter-a            draft        (seeded above by file 04)
  //   letter-a-sounds     published    NURSERY + KG1, en + bn
  //   letter-a-practice   published    NURSERY + KG1, en only (fallback demo)
  //   letter-c            in_review
  //   letter-z-advanced   published    KG2 only (wrong-grade probe)

  // ---------- Media assets ----------
  const jungleMascot = await prisma.mediaAsset.upsert({
    where: { id: "00000000-0000-0000-0000-000000000401" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000401",
      url: "https://cdn.kidlearn.test/images/mascot-jungle-monkey.png",
      kind: "image",
    },
  });

  const letterAVideoEn = await prisma.mediaAsset.upsert({
    where: { id: "00000000-0000-0000-0000-000000000402" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000402",
      url: "https://cdn.kidlearn.test/video/en/letter-a.mp4",
      kind: "video",
      language: "en",
    },
  });

  const letterAVideoBn = await prisma.mediaAsset.upsert({
    where: { id: "00000000-0000-0000-0000-000000000403" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000403",
      url: "https://cdn.kidlearn.test/video/bn/letter-a.mp4",
      kind: "video",
      language: "bn",
    },
  });

  // FR-WORLD-05 — the mascot the world screen themes itself with. Written as a
  // separate update because the `jungle` upsert above passes `update: {}`.
  await prisma.world.update({
    where: { id: jungle.id },
    data: { mascotAssetId: jungleMascot.id },
  });

  // ---------- Activity + quiz, straight from the @kidlearn/types fixtures ----
  // Reusing the canonical fixtures is what guarantees the seeded JSONB parses
  // with the very parsers `GET /api/content/lessons/:id` runs against it.
  const dragTheAnimalHome = await prisma.activity.upsert({
    where: { id: "00000000-0000-0000-0000-000000000110" },
    update: { definition: asJson(validDragDrop) },
    create: {
      id: "00000000-0000-0000-0000-000000000110",
      type: "drag_drop",
      status: "published",
      schemaVersion: validDragDrop.schemaVersion,
      definition: asJson(validDragDrop),
    },
  });

  const letterASoundsQuiz = await prisma.quiz.upsert({
    where: { id: "00000000-0000-0000-0000-000000000210" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000210",
      title: "Letter A Sounds Quiz",
      status: "published",
    },
  });

  const quizQuestions = [
    {
      id: "00000000-0000-0000-0000-000000000211",
      format: "mcq",
      definition: validMcq,
    },
    {
      id: "00000000-0000-0000-0000-000000000212",
      format: "picture_select",
      definition: validPictureSelect,
    },
    {
      id: "00000000-0000-0000-0000-000000000213",
      format: "mcq",
      definition: validMcq,
    },
  ] as const;

  for (const [index, question] of quizQuestions.entries()) {
    await prisma.quizQuestion.upsert({
      where: { id: question.id },
      update: { definition: asJson(question.definition) },
      create: {
        id: question.id,
        quizId: letterASoundsQuiz.id,
        format: question.format,
        sortOrder: index + 1,
        schemaVersion: question.definition.schemaVersion,
        definition: asJson(question.definition),
      },
    });
  }

  // ---------- Lessons ----------
  const letterASounds = await prisma.lesson.upsert({
    where: { topicId_slug: { topicId: alphabet.id, slug: "letter-a-sounds" } },
    update: {},
    create: {
      slug: "letter-a-sounds",
      title: "The Letter A",
      sortOrder: 2,
      gradeLevels: ["NURSERY", "KG1"],
      status: "published",
      topicId: alphabet.id,
      worldId: jungle.id,
      activityId: dragTheAnimalHome.id,
      quizId: letterASoundsQuiz.id,
    },
  });

  await prisma.lessonTranslation.upsert({
    where: {
      lessonId_language: { lessonId: letterASounds.id, language: "en" },
    },
    update: {},
    create: {
      lessonId: letterASounds.id,
      language: "en",
      introScript: "Hello! Today we are going to learn the letter A.",
      videoAssetId: letterAVideoEn.id,
    },
  });

  await prisma.lessonTranslation.upsert({
    where: {
      lessonId_language: { lessonId: letterASounds.id, language: "bn" },
    },
    update: {},
    create: {
      lessonId: letterASounds.id,
      language: "bn",
      introScript: "হ্যালো! আজ আমরা A বর্ণটি শিখব।",
      videoAssetId: letterAVideoBn.id,
    },
  });

  // English-only on purpose: exercises the `bn → en` fallback by hand.
  const letterAPractice = await prisma.lesson.upsert({
    where: {
      topicId_slug: { topicId: alphabet.id, slug: "letter-a-practice" },
    },
    update: {},
    create: {
      slug: "letter-a-practice",
      title: "Practise the Letter A",
      sortOrder: 3,
      gradeLevels: ["NURSERY", "KG1"],
      status: "published",
      topicId: alphabet.id,
      worldId: jungle.id,
      activityId: dragTheAnimalHome.id,
    },
  });

  await prisma.lessonTranslation.upsert({
    where: {
      lessonId_language: { lessonId: letterAPractice.id, language: "en" },
    },
    update: {},
    create: {
      lessonId: letterAPractice.id,
      language: "en",
      introScript: "Let's practise the letter A together!",
      videoAssetId: letterAVideoEn.id,
    },
  });

  // Awaiting human review — must never reach a child (§7.3.4).
  await prisma.lesson.upsert({
    where: { topicId_slug: { topicId: alphabet.id, slug: "letter-c" } },
    update: {},
    create: {
      slug: "letter-c",
      title: "The Letter C",
      sortOrder: 5,
      gradeLevels: ["NURSERY", "KG1"],
      status: "in_review",
      topicId: alphabet.id,
      worldId: jungle.id,
    },
  });

  // Published, but for KG2 only: the wrong-grade probe for FR-CURR-02.
  await prisma.lesson.upsert({
    where: {
      topicId_slug: { topicId: alphabet.id, slug: "letter-z-advanced" },
    },
    update: {},
    create: {
      slug: "letter-z-advanced",
      title: "The Letter Z",
      sortOrder: 6,
      gradeLevels: ["KG2"],
      status: "published",
      topicId: alphabet.id,
      worldId: jungle.id,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
