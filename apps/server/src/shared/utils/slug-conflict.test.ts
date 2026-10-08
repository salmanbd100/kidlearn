import { Prisma } from "@kidlearn/db";
import { describe, expect, it } from "vitest";
import type { ApiError } from "../errors/errors.js";
import { asSlugConflict } from "./slug-conflict.js";

function uniqueViolation(
  target: unknown,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("unique", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

async function conflictFor(error: unknown): Promise<ApiError> {
  try {
    await asSlugConflict("lesson", () => Promise.reject(error));
  } catch (caught) {
    return caught as ApiError;
  }
  throw new Error("expected asSlugConflict to throw");
}

describe("asSlugConflict", () => {
  it("answers DUPLICATE_SLUG for a slug collision", async () => {
    const conflict = await conflictFor(uniqueViolation(["topicId", "slug"]));

    expect(conflict.statusCode).toBe(409);
    expect(conflict.details).toEqual({ code: "DUPLICATE_SLUG" });
  });

  it("answers QUIZ_IN_USE, not DUPLICATE_SLUG, when the quiz is already linked", async () => {
    const conflict = await conflictFor(uniqueViolation(["quizId"]));

    expect(conflict.statusCode).toBe(409);
    expect(conflict.details).toEqual({ code: "QUIZ_IN_USE" });
  });

  it("rethrows anything that is not a unique violation", async () => {
    const boom = new Error("connection reset");

    await expect(
      asSlugConflict("lesson", () => Promise.reject(boom)),
    ).rejects.toBe(boom);
  });
});
