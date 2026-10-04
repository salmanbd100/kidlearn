import { Prisma } from "@kidlearn/db";
import { ApiError } from "../errors/errors.js";

/** Turns Postgres's unique violation into a `409` that names the cause. */
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

/** Whether a caught error is the unique-index violation. */
export function isSlugConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * `Lesson.quizId` is unique, so a lesson write can hit a second unique index. A
 * bare `P2002` cannot tell the two apart; the violated columns are in `meta`.
 */
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
