/**
 * Single import path for database access inside `apps/server`. The client is
 * the singleton owned by `@kidlearn/db` — never construct a `PrismaClient`
 * here. Prisma model types are imported directly from `@kidlearn/db`.
 */
export { prisma } from "@kidlearn/db";
