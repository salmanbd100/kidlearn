import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEV_PARENT_EMAIL = "dev-parent@kidlearn.local";
/** Fixed id so re-seeding is idempotent; better-auth uses opaque string ids. */
const DEV_PARENT_USER_ID = "dev-user-parent";

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
