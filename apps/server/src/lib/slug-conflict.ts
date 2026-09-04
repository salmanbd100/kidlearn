import { Prisma } from "@kidlearn/db";
import { ApiError } from "./errors.js";

/** Turns Postgres's unique violation into a `409` that names the cause. */
export async function asSlugConflict<T>(
  model: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
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
