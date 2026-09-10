import { Prisma } from "@kidlearn/db";

/** Postgres aborted a Serializable transaction rather than let it interleave. */
function isSerializationFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

/** How many times a serialization failure is retried before it surfaces. */
export const MAX_SERIALIZATION_RETRIES = 3;

/** Base for the exponential backoff, in milliseconds. */
const RETRY_BASE_MS = 20;

/**
 * Runs a Serializable transaction, retrying if Postgres aborted it rather than
 * let it interleave.
 *
 * Backs off with jitter between attempts. An immediate retry re-runs into the
 * same contention window that caused the abort, which is how two writers
 * finishing a lesson at once could both lose — the reward grant is the hot path
 * and it is the one where losing means a celebration screen showing nothing.
 */
export async function withSerializationRetry<T>(
  run: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (
        !isSerializationFailure(error) ||
        attempt >= MAX_SERIALIZATION_RETRIES
      ) {
        throw error;
      }
      await sleep(backoffMs(attempt));
    }
  }
}

/**
 * Exponential, with full jitter. The jitter is the point: without it, two
 * transactions that collided once wait exactly the same time and collide again.
 */
function backoffMs(attempt: number): number {
  return Math.random() * RETRY_BASE_MS * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
