/**
 * Writes one step started that a later step must not overtake.
 *
 * Completion depends on two of them: the server derives the quiz star and
 * per-answer coins from the responses already stored (R-04), and refuses a
 * lesson whose progress row does not show it was played through (R-06).
 */
export interface PendingWrites {
  add: (write: Promise<unknown>) => void;
  /** Resolves once no write is outstanding — each settled, either way. */
  settled: () => Promise<void>;
}

export function createPendingWrites(): PendingWrites {
  const writes = new Set<Promise<unknown>>();

  return {
    add(write) {
      writes.add(write);
      const forget = () => writes.delete(write);
      write.then(forget, forget);
    },
    async settled() {
      // One yield first: the step report for the step just finished is added by
      // LessonPlayer's effect, which React runs after the reward step's own.
      await Promise.resolve();
      while (writes.size > 0) await Promise.allSettled([...writes]);
    },
  };
}
