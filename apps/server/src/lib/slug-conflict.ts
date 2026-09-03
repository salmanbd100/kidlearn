import { Prisma } from "@kidlearn/db";
import { ApiError } from "./errors.js";

/**
 * Turns Postgres's unique violation into a `409` that names the cause.
 *
 * Slugs are unique per model (`World.slug`, `Subject.slug`, `CharacterSheet.slug`)
 * or per parent (`Topic@@unique([subjectId, slug])`, `Lesson@@unique([topicId,
 * slug])`), and an admin re-typing one that exists is ordinary rather than
 * exceptional — it should read as "that slug is taken", not as a server error.
 *
 * Wrapping the write rather than only checking first is what makes that true under
 * concurrency: a `findUnique` before a `create` is check-then-act, so two admins
 * saving the same slug at once both pass the check and the loser hits the index.
 * Without this the error handler sees an unrecognised Prisma error and answers
 * `500`, which is a status the endpoint does not document.
 */
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

/**
 * Whether a caught error is the unique-index violation.
 *
 * Exported for the callers that treat a lost race as something other than a `409`
 * — `promoteJobCharacters` is idempotent by slug, so for it the loser of a race
 * means "somebody else already saved this character", which is a `skipped`.
 */
export function isSlugConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
