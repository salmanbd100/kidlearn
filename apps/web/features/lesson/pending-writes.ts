/**
 * Writes one step started that a later step must not overtake: completion needs the quiz responses
 * stored and a progress row showing the lesson was played through.
 */
export interface PendingWrites {
  add: (write: Promise<unknown>) => void;
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
      // One yield first: LessonPlayer's effect adds the finished step's report after the reward
      // step's own.
      await Promise.resolve();
      while (writes.size > 0) await Promise.allSettled([...writes]);
    },
  };
}
