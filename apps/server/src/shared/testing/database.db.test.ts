import { describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma.js";
import { createChild, createParent } from "./factories.js";
import { assertIsTestDatabase } from "./test-database-url.js";

describe("the test-database harness", () => {
  // Two tests in order: the first writes, the second must not see it.
  it("writes through to Postgres", async () => {
    const parent = await createParent();
    await createChild(parent.id);

    expect(await prisma.childProfile.count()).toBe(1);
  });

  it("starts every test from empty tables", async () => {
    expect(await prisma.childProfile.count()).toBe(0);
    expect(await prisma.parent.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
  });

  it("refuses a database whose name does not end in _test", () => {
    expect(() =>
      assertIsTestDatabase("postgresql://u:p@db.example.com:5432/postgres"),
    ).toThrow(/must end in "_test"/);
    expect(() =>
      assertIsTestDatabase("postgresql://u:p@localhost:5432/kidlearn_test"),
    ).not.toThrow();
  });
});
