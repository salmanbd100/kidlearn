/**
 * Writes one step started that a later step must not overtake.
 *
 * The quiz submission is the one that matters: the server derives the quiz
 * star and per-answer coins from the responses already stored when the lesson
 * is completed, so a completion that lands first pays out as if there had been
 * no quiz (R-04).
 */
export interface PendingWrites {
  add: (write: Promise<unknown>) => void;
  /** Resolves once every write added so far has settled, either way. */
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
      await Promise.allSettled([...writes]);
    },
  };
}
