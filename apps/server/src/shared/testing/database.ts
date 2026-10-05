import { prisma } from "../../config/prisma.js";

// Raw SQL, which `backend.md §3` bans from application code: truncation has no
// Prisma query-API equivalent, and this file is never imported outside tests.

let tables: string | undefined;

/**
 * Empties every table the migrations created. One `TRUNCATE … CASCADE` rather
 * than per-model `deleteMany`s in foreign-key order, so a new model can never
 * be forgotten and left holding rows from the previous test.
 */
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
