/**
 * Writes one step started that a later step must not overtake: completion needs the quiz responses
 * stored and a progress row showing the lesson was played through. Each write starts once the one
 * before it has settled, as the server refuses a step report more than one past the stored step.
 */
export interface PendingWrites {
  add: (write: () => Promise<unknown>) => void;
  settled: () => Promise<void>;
}

export function createPendingWrites(): PendingWrites {
  // Never rejects: a failed write must neither stall the chain nor hold the reward hostage.
  let tail: Promise<unknown> = Promise.resolve();

  return {
    add(write) {
      tail = tail.then(write).catch(() => undefined);
    },
    async settled() {
      // One yield first: LessonPlayer's effect adds the finished step's report after the reward
      // step's own.
      await Promise.resolve();
      let awaited: Promise<unknown>;
      do {
        awaited = tail;
        await awaited;
      } while (awaited !== tail);
    },
  };
}
