import { Prisma } from "@kidlearn/db";

/** Postgres aborted a Serializable transaction rather than let it interleave. */
function isSerializationFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

/** Runs a Serializable transaction, once more if Postgres aborted the first. */
export async function withSerializationRetry<T>(
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isSerializationFailure(error)) throw error;
    return run();
  }
}
