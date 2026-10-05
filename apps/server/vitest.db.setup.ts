import { afterAll, beforeEach } from "vitest";
import { prisma } from "./src/config/prisma.js";
import { resetDatabase } from "./src/shared/testing/database.js";

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});
