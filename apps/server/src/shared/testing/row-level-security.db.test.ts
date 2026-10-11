import { describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma.js";

// Raw SQL, banned by `backend.md §3` elsewhere: the catalogue has no query-API equivalent and this is test-only.

describe("row-level security", () => {
  it("is enabled on every table in public, so Supabase's Data API cannot reach one", async () => {
    const open = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        AND NOT c.relrowsecurity
      ORDER BY c.relname`;

    expect(open.map(({ relname }) => relname)).toEqual([]);
  });
});
