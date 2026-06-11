import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot-reloads / module re-evaluations so we
// don't exhaust the connection pool in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Re-export generated model types (Parent, Child, Prisma namespace, ...) so
// consumers import everything from "@kidlearn/db".
export * from "@prisma/client";
