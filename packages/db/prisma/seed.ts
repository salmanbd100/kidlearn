import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
