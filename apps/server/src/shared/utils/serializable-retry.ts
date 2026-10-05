import { Prisma } from "@kidlearn/db";

function isSerializationFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

/** Nothing ran, so a retry is safe. P2028 also covers a transaction past its `timeout`; that is matched out by message and not retried. */
function isTransactionStartTimeout(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2028" &&
    error.message.includes("Unable to start a transaction")
  );
}

export const MAX_SERIALIZATION_RETRIES = 3;

const RETRY_BASE_MS = 20;

/** Backs off with jitter: an immediate retry re-enters the contention window, and losing the reward grant shows a blank celebration. */
export async function withSerializationRetry<T>(
  run: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (
        !(isSerializationFailure(error) || isTransactionStartTimeout(error)) ||
        attempt >= MAX_SERIALIZATION_RETRIES
      ) {
        throw error;
      }
      await sleep(backoffMs(attempt));
    }
  }
}

/** Full jitter, so transactions that collided once do not wait the same time and collide again. */
function backoffMs(attempt: number): number {
  return Math.random() * RETRY_BASE_MS * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
