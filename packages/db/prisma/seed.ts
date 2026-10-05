import { validDragDrop, validMcq, validPictureSelect } from "@kidlearn/types";
import { type Prisma, PrismaClient } from "@prisma/client";
import { seedJourney } from "./journey.js";
import { seedStories } from "./seed-stories.js";

const prisma = new PrismaClient();

const DEV_PARENT_EMAIL = "dev-parent@kidlearn.local";
const DEV_PARENT_USER_ID = "dev-user-parent";

/**
 * Fixtures are typed as Zod-inferred interfaces, which lack the index signature Prisma's `InputJsonValue` requires;
 * a `JSON.stringify` round-trip yields the same value in an accepted type, a real conversion rather than a cast.
 */
function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function seedNames(
  rows: {
    world?: string;
    subject?: string;
    topic?: string;
    en: string;
    bn: string;
  }[],
): Promise<void> {
  for (const row of rows) {
    for (const language of ["en", "bn"] as const) {
      const name = row[language];
      if (row.world !== undefined) {
        await prisma.worldTranslation.upsert({
          where: { worldId_language: { worldId: row.world, language } },
          update: { name },
          create: { worldId: row.world, language, name },
        });
      }
      if (row.subject !== undefined) {
        await prisma.subjectTranslation.upsert({
          where: { subjectId_language: { subjectId: row.subject, language } },
          update: { name },
          create: { subjectId: row.subject, language, name },
        });
      }
      if (row.topic !== undefined) {
        await prisma.topicTranslation.upsert({
          where: { topicId_language: { topicId: row.topic, language } },
          update: { name },
          create: { topicId: row.topic, language, name },
        });
      }
    }
  }
}

async function main() {
  // No `account` row on purpose, so this parent cannot sign in; it only satisfies the FK for local fixtures.
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

  const ocean = await prisma.world.upsert({
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

  const mathematics = await prisma.subject.upsert({
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

  const science = await prisma.subject.upsert({
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

  const socialSkills = await prisma.subject.upsert({
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

  await seedNames([
    { world: jungle.id, en: "Jungle World", bn: "জঙ্গল জগৎ" },
    { world: ocean.id, en: "Ocean World", bn: "সমুদ্র জগৎ" },
    { subject: language.id, en: "Language", bn: "ভাষা" },
    { subject: mathematics.id, en: "Mathematics", bn: "গণিত" },
    { subject: science.id, en: "Science", bn: "বিজ্ঞান" },
    { subject: socialSkills.id, en: "Social Skills", bn: "সামাজিক দক্ষতা" },
    { topic: alphabet.id, en: "Alphabet", bn: "বর্ণমালা" },
  ]);

  /** Owned on update too: the `weekly_report_concepts` backfill leaves an empty array, so `update: {}` would leave demo lessons teaching nothing. */
  const lessonA = await prisma.lesson.upsert({
    where: { topicId_slug: { topicId: alphabet.id, slug: "letter-a" } },
    update: { conceptsIntroduced: ["letter:A", "word:apple", "word:ant"] },
    create: {
      slug: "letter-a",
      title: "Letter A",
      sortOrder: 1,
      gradeLevels: ["NURSERY", "KG1"],
      status: "draft",
      topicId: alphabet.id,
      worldId: jungle.id,
      conceptsIntroduced: ["letter:A", "word:apple", "word:ant"],
    },
  });

  /** The one field this seed asserts on update as well as create. */
  await prisma.lessonTranslation.upsert({
    where: { lessonId_language: { lessonId: lessonA.id, language: "en" } },
    update: { title: "Letter A" },
    create: {
      lessonId: lessonA.id,
      language: "en",
      title: "Letter A",
      introScript: "Hello! Today we are going to learn about the letter A!",
    },
  });

  await prisma.lessonTranslation.upsert({
    where: { lessonId_language: { lessonId: lessonA.id, language: "bn" } },
    update: { title: "অক্ষর A" },
    create: {
      lessonId: lessonA.id,
      language: "bn",
      title: "অক্ষর A",
      introScript: "হ্যালো! আজ আমরা A অক্ষর সম্পর্কে শিখব!",
    },
  });

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

  const letterAQuiz = await prisma.quiz.upsert({
    where: { id: "00000000-0000-0000-0000-000000000201" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000201",
      title: "Letter A Quiz",
      status: "published",
    },
  });

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

  await prisma.lesson.update({
    where: { id: lessonA.id },
    data: {
      activityId: letterAActivity.id,
      quizId: letterAQuiz.id,
    },
  });

  // The dev story library is `stories.ts` + `seedStories()`; a second inline owner made `db:seed` non-idempotent (page id collision).

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

  // The picker offers every published `isDefault` character; Leo alone gave no choice (FR-PROF-02).
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

  // `isDefault: false` with a real `unlockRule`: shown as locked silhouettes until the child's ledger meets the criteria.
  const UNLOCKABLE_CHARACTERS = [
    {
      slug: "mia-the-monkey",
      name: "Mia the Monkey",
      unlockRule: { stars: 10 },
    },
    {
      slug: "ollie-the-octopus",
      name: "Ollie the Octopus",
      unlockRule: { coins: 50 },
    },
    {
      slug: "zara-the-zebra",
      name: "Zara the Zebra",
      unlockRule: { badges: 2 },
    },
  ];

  for (const { slug, name, unlockRule } of UNLOCKABLE_CHARACTERS) {
    await prisma.character.upsert({
      where: { slug },
      update: { unlockRule, isDefault: false },
      create: { slug, name, isDefault: false, status: "published", unlockRule },
    });
  }

  /** `ruleType` and `rule` are owned on update, unlike most upserts here. */
  const MVP_BADGES = [
    {
      slug: "alphabet-hero",
      name: "Alphabet Hero",
      description: "Complete all letters in the Alphabet topic",
      ruleType: "lessons_completed_in_topic",
      // `"all"`, not 26: a twenty-seventh letter lesson must move the goalposts without re-authoring this row.
      rule: { topicSlug: "alphabet", count: "all" },
    },
    {
      slug: "math-champion",
      name: "Math Champion",
      description: "Complete every lesson in the Numbers topic",
      ruleType: "lessons_completed_in_topic",
      rule: { topicSlug: "numbers", count: "all" },
    },
    {
      slug: "reading-star",
      name: "Reading Star",
      description: "Finish 10 stories",
      ruleType: "stories_completed",
      rule: { count: 10 },
    },
    {
      slug: "animal-expert",
      name: "Animal Expert",
      // 20 questions answered right, not 20 lessons opened.
      description: "Identify 20 animals correctly",
      ruleType: "quiz_correct_in_topic",
      rule: { topicSlug: "animals", count: 20 },
    },
    {
      slug: "streak-starter",
      name: "Streak Starter",
      description: "Learn 3 days in a row",
      ruleType: "streak_days",
      rule: { days: 3 },
    },
    {
      slug: "week-warrior",
      name: "Week Warrior",
      description: "Learn 7 days in a row",
      ruleType: "streak_days",
      rule: { days: 7 },
    },
  ];

  for (const badge of MVP_BADGES) {
    await prisma.badge.upsert({
      where: { slug: badge.slug },
      update: { ruleType: badge.ruleType, rule: badge.rule },
      create: { ...badge, status: "published" },
    });
  }

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

  // Developer scaffolding for `GET /api/content/*`; upserted on stable ids so re-seeding changes no row count.

  // Local paths, not an unresolvable CDN: a broken media url is indistinguishable from a broken player, and a remote host
  // missing from `MEDIA_ASSET_HOSTS` makes `next/image` throw and takes down the whole home screen.
  const jungleMascot = await prisma.mediaAsset.upsert({
    where: { id: "00000000-0000-0000-0000-000000000401" },
    update: { url: "/dev/mascot-jungle-monkey.png" },
    create: {
      id: "00000000-0000-0000-0000-000000000401",
      url: "/dev/mascot-jungle-monkey.png",
      kind: "image",
    },
  });

  const letterAVideoEn = await prisma.mediaAsset.upsert({
    where: { id: "00000000-0000-0000-0000-000000000402" },
    update: { url: "/dev/letter-a.en.mp4" },
    create: {
      id: "00000000-0000-0000-0000-000000000402",
      url: "/dev/letter-a.en.mp4",
      kind: "video",
      language: "en",
    },
  });

  // Absent for `bn` on purpose: exercises the `assetFallbacks.videoUrl` fallback (FR-I18N-01).
  const letterAPosterEn = await prisma.mediaAsset.upsert({
    where: { id: "00000000-0000-0000-0000-000000000404" },
    update: { url: "/dev/letter-a.en.jpg" },
    create: {
      id: "00000000-0000-0000-0000-000000000404",
      url: "/dev/letter-a.en.jpg",
      kind: "image",
      language: "en",
    },
  });

  const letterAIntroAudioEn = await prisma.mediaAsset.upsert({
    where: { id: "00000000-0000-0000-0000-000000000405" },
    update: { url: "/dev/letter-a-intro.en.mp3" },
    create: {
      id: "00000000-0000-0000-0000-000000000405",
      url: "/dev/letter-a-intro.en.mp3",
      kind: "audio",
      language: "en",
    },
  });

  const letterAVideoBn = await prisma.mediaAsset.upsert({
    where: { id: "00000000-0000-0000-0000-000000000403" },
    update: { url: "/dev/letter-a.bn.mp4" },
    create: {
      id: "00000000-0000-0000-0000-000000000403",
      url: "/dev/letter-a.bn.mp4",
      kind: "video",
      language: "bn",
    },
  });

  // A separate update because the `jungle` upsert above passes `update: {}`.
  await prisma.world.update({
    where: { id: jungle.id },
    data: { mascotAssetId: jungleMascot.id },
  });

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

  const letterASounds = await prisma.lesson.upsert({
    where: { topicId_slug: { topicId: alphabet.id, slug: "letter-a-sounds" } },
    // Shares `letter:A` with the draft lesson on purpose: the report's dedupe stops a child who finished both being credited twice.
    update: {
      conceptsIntroduced: ["letter:A", "word:apple", "word:alligator"],
    },
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
      conceptsIntroduced: ["letter:A", "word:apple", "word:alligator"],
    },
  });

  await prisma.lessonTranslation.upsert({
    where: {
      lessonId_language: { lessonId: letterASounds.id, language: "en" },
    },
    update: {
      title: "The Letter A",
      videoAssetId: letterAVideoEn.id,
      videoPosterAssetId: letterAPosterEn.id,
      introAudioAssetId: letterAIntroAudioEn.id,
    },
    create: {
      lessonId: letterASounds.id,
      language: "en",
      title: "The Letter A",
      introScript: "Hello! Today we are going to learn the letter A.",
      videoAssetId: letterAVideoEn.id,
      videoPosterAssetId: letterAPosterEn.id,
      introAudioAssetId: letterAIntroAudioEn.id,
    },
  });

  await prisma.lessonTranslation.upsert({
    where: {
      lessonId_language: { lessonId: letterASounds.id, language: "bn" },
    },
    update: { title: "অক্ষর A", videoAssetId: letterAVideoBn.id },
    create: {
      lessonId: letterASounds.id,
      language: "bn",
      title: "অক্ষর A",
      introScript: "হ্যালো! আজ আমরা A বর্ণটি শিখব।",
      videoAssetId: letterAVideoBn.id,
      // No Bangla poster or narration: exercises both `assetFallbacks` flags (FR-I18N-01).
    },
  });

  const letterAPractice = await prisma.lesson.upsert({
    where: {
      topicId_slug: { topicId: alphabet.id, slug: "letter-a-practice" },
    },
    // Practice, not new ground: revisits `letter:A`, so an empty array is the honest value.
    update: { conceptsIntroduced: [] },
    create: {
      slug: "letter-a-practice",
      title: "Practise the Letter A",
      sortOrder: 3,
      gradeLevels: ["NURSERY", "KG1"],
      status: "published",
      topicId: alphabet.id,
      worldId: jungle.id,
      activityId: dragTheAnimalHome.id,
      conceptsIntroduced: [],
    },
  });

  await prisma.lessonTranslation.upsert({
    where: {
      lessonId_language: { lessonId: letterAPractice.id, language: "en" },
    },
    update: {
      title: "Practise the Letter A",
      videoAssetId: letterAVideoEn.id,
      videoPosterAssetId: letterAPosterEn.id,
    },
    create: {
      lessonId: letterAPractice.id,
      language: "en",
      title: "Practise the Letter A",
      introScript: "Let's practise the letter A together!",
      videoAssetId: letterAVideoEn.id,
      videoPosterAssetId: letterAPosterEn.id,
    },
  });

  // Awaiting human review; must never reach a child.
  await prisma.lesson.upsert({
    where: { topicId_slug: { topicId: alphabet.id, slug: "letter-c" } },
    update: { conceptsIntroduced: ["letter:C", "word:cat"] },
    create: {
      slug: "letter-c",
      title: "The Letter C",
      sortOrder: 5,
      gradeLevels: ["NURSERY", "KG1"],
      status: "in_review",
      topicId: alphabet.id,
      worldId: jungle.id,
      conceptsIntroduced: ["letter:C", "word:cat"],
    },
  });

  await prisma.lesson.upsert({
    where: {
      topicId_slug: { topicId: alphabet.id, slug: "letter-z-advanced" },
    },
    update: { conceptsIntroduced: ["letter:Z", "word:zebra"] },
    create: {
      slug: "letter-z-advanced",
      title: "The Letter Z",
      sortOrder: 6,
      gradeLevels: ["KG2"],
      status: "published",
      topicId: alphabet.id,
      worldId: jungle.id,
      conceptsIntroduced: ["letter:Z", "word:zebra"],
    },
  });

  // Last: the fixtures resolve their worlds by slug. Also runnable alone via `seed:stories`.
  await seedStories(prisma);

  // Last: resolves worlds, subjects and reused video assets by the ids created above.
  await seedJourney(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
