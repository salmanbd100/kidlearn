import { Prisma } from "@kidlearn/db";
import { ApiError } from "../errors/errors.js";

export async function asSlugConflict<T>(
  model: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isQuizLinkConflict(error)) {
      throw ApiError.conflict("That quiz is already linked to another lesson", {
        code: "QUIZ_IN_USE",
      });
    }
    if (isSlugConflict(error)) {
      throw ApiError.conflict(`A ${model} with that slug already exists`, {
        code: "DUPLICATE_SLUG",
      });
    }
    throw error;
  }
}

export function isSlugConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/** `Lesson.quizId` is unique too; a bare `P2002` cannot tell them apart, so the violated columns in `meta` are read. */
function isQuizLinkConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes("quizId")
    : typeof target === "string" && target.includes("quizId");
}
