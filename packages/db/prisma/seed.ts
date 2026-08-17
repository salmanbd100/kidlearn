import { validDragDrop, validMcq, validPictureSelect } from "@kidlearn/types";
import { type Prisma, PrismaClient } from "@prisma/client";
import { seedStories } from "./seed-stories.js";

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

/**
 * Child-facing display names, in both locales.
 *
 * Seeded for every curriculum row the student API can reach, because an untranslated
 * seed makes the locale fallback invisible: everything would resolve through the
 * admin label and look correct in Bangla without a single translation existing.
 */
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

  /**
   * `title` is the one field this seed asserts on **update** as well as create.
   *
   * Every other upsert here passes `update: {}` on purpose — a re-seed must not
   * stamp on content someone has since edited. Titles are the exception because
   * of how they arrived: the `curriculum_name_translations` migration backfilled
   * `LessonTranslation.title` from `Lesson.title`, which is the English admin
   * label, so every pre-existing `bn` row came out reading English. With
   * `update: {}` those rows would keep that English title forever — the seed
   * would look correct on a fresh database and silently leave every existing one
   * wrong. Owning the field on update is what makes a re-seed repair it.
   */
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

  // ---------- Earned characters (file 24, FR-GAM-05) ----------
  // `isDefault: false` and a real `unlockRule`, which is what separates these
  // from the starter set above: they appear in the picker as locked silhouettes
  // and become selectable when the child's ledger totals meet the criteria.
  //
  // The three shapes the engine understands, one each, so a developer can see
  // all of them fire without inventing content. Every key a rule names must be
  // met — `{ stars: 10 }` is ten stars and nothing else.
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
      // The rule is owned on update, for the reason the badge block below gives.
      update: { unlockRule, isDefault: false },
      create: { slug, name, isDefault: false, status: "published", unlockRule },
    });
  }

  // ---------- Six FR-GAM-04 Badges ----------
  /**
   * `ruleType` and `rule` are owned on **update**, unlike almost every other
   * upsert in this file.
   *
   * The reason is the same one `LessonTranslation.title` gives: these rows were
   * seeded before the engine existed, and two of them named a `ruleType` the
   * engine has no evaluator for (`lessons_completed_in_subject`). With
   * `update: {}` a re-seed would leave those rows in place, evaluating false
   * forever while looking correct on a fresh database. `name` and `description`
   * are deliberately *not* owned — those are copy an admin may have edited
   * (file 33), and a rule is not.
   *
   * `topicSlug: "numbers"` and `"animals"` name topics no seed has created yet.
   * That is intentional and safe: a topic with nothing published in it counts as
   * zero, so the badge simply never fires until the curriculum exists.
   */
  const MVP_BADGES = [
    {
      slug: "alphabet-hero",
      name: "Alphabet Hero",
      description: "Complete all letters in the Alphabet topic",
      ruleType: "lessons_completed_in_topic",
      // `"all"`, not 26: publishing a twenty-seventh letter lesson must move the
      // goalposts without anyone re-authoring this row.
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
      // Honestly measured: 20 *questions* answered right, not 20 lessons opened.
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
  // Local paths, not a CDN host that does not resolve. The lesson player is the
  // first screen where a broken media url is indistinguishable from a broken
  // player, so the seeded lesson points at files a developer can actually serve
  // — `apps/web/public/dev/`, which has a README saying what to drop there. The
  // real assets arrive by admin upload (file 33) and the AI pipeline (file 36).
  //
  // The mascot below is the reason this rule is not only about the player: a
  // remote host reaching `next/image` throws `Invalid src prop` unless the origin
  // is listed in `MEDIA_ASSET_HOSTS`, so an unresolvable CDN url took down the
  // whole home screen rather than showing one broken image. A relative path skips
  // `remotePatterns` entirely and degrades to a missing image, which is what a
  // seeded placeholder should do.
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

  // Deliberately absent for `bn`: the Bangla lesson below falls back to the
  // English film, which is the `assetFallbacks.videoUrl` path (FR-I18N-01) and
  // the only way to exercise it without a second recording.
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
    update: { title: "The Letter A" },
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
    update: { title: "অক্ষর A" },
    create: {
      lessonId: letterASounds.id,
      language: "bn",
      title: "অক্ষর A",
      introScript: "হ্যালো! আজ আমরা A বর্ণটি শিখব।",
      videoAssetId: letterAVideoBn.id,
      // No Bangla poster or narration: a `bn` child on this lesson gets the
      // English poster and the English voice, which is exactly the pair of
      // `assetFallbacks` flags file 17 reports (FR-I18N-01).
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
    update: { title: "Practise the Letter A" },
    create: {
      lessonId: letterAPractice.id,
      language: "en",
      title: "Practise the Letter A",
      introScript: "Let's practise the letter A together!",
      videoAssetId: letterAVideoEn.id,
      videoPosterAssetId: letterAPosterEn.id,
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

  // File 25 — the dev story library. Last, because the fixtures resolve their
  // world by slug and both worlds are created above. Also runnable on its own as
  // `pnpm --filter @kidlearn/db seed:stories`.
  await seedStories(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
