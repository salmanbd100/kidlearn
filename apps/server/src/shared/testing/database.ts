import { prisma } from "../../config/prisma.js";

// Raw SQL, banned by `backend.md §3` elsewhere: truncation has no query-API equivalent and this is test-only.

let tables: string | undefined;

/** One `TRUNCATE … CASCADE` so a new model can never be forgotten. */
export async function resetDatabase(): Promise<void> {
  if (tables === undefined) {
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    tables = rows.map(({ tablename }) => `"public"."${tablename}"`).join(", ");
  }
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`,
  );
}
