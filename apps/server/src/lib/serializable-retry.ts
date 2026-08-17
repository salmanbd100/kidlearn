import { Prisma } from "@kidlearn/db";

/** Postgres aborted a Serializable transaction rather than let it interleave. */
function isSerializationFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

/**
 * Runs a Serializable transaction, once more if Postgres aborted the first.
 *
 * Every read-then-write here runs at Serializable, because READ COMMITTED loses
 * an update when two requests interleave — and on a surface built for a child
 * who taps everything, two requests arriving together is ordinary rather than an
 * edge case. The cost is that the loser of a race aborts with `P2034` having
 * written nothing, so a caller that does not retry turns a double tap into a
 * 500. Every `$transaction` in `services/` belongs inside this.
 *
 * One retry, not a loop: a second failure means sustained contention on one
 * child's rows, which is not a real user.
 */
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
