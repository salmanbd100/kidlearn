import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const parent = await prisma.parent.upsert({
    where: { email: "dev-parent@kidlearn.local" },
    update: {},
    create: {
      googleId: "dev-google-id",
      email: "dev-parent@kidlearn.local",
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
}

main().finally(() => prisma.$disconnect());
