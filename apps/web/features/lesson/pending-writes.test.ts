import { describe, expect, it } from "vitest";
import { createPendingWrites } from "./pending-writes";

function deferred() {
  let land = () => {};
  let fail = (_error: Error) => {};
  const promise = new Promise<void>((resolve, reject) => {
    land = resolve;
    fail = reject;
  });
  return { promise, land: () => land(), fail: (error: Error) => fail(error) };
}

async function flush() {
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
}

describe("createPendingWrites", () => {
  it("settles at once when nothing was added", async () => {
    await expect(createPendingWrites().settled()).resolves.toBeUndefined();
  });

  it("waits for every write added so far", async () => {
    const writes = createPendingWrites();
    const write = deferred();
    writes.add(() => write.promise);

    let isSettled = false;
    const settled = writes.settled().then(() => {
      isSettled = true;
    });
    await flush();
    expect(isSettled).toBe(false);

    write.land();
    await settled;
    expect(isSettled).toBe(true);
  });

  it("counts a write added in the same tick, after it was asked", async () => {
    // The reward step asks first; the player's effect, which React runs after its child's, adds the
    // report for the finished step.
    const writes = createPendingWrites();
    const write = deferred();
    let isSettled = false;
    const settled = writes.settled().then(() => {
      isSettled = true;
    });
    writes.add(() => write.promise);

    await flush();
    expect(isSettled).toBe(false);

    write.land();
    await settled;
    expect(isSettled).toBe(true);
  });

  it("starts each write only once the one before it has settled", async () => {
    // Two quick taps must not race: the server refuses a step report more than one past the stored step.
    const writes = createPendingWrites();
    const first = deferred();
    const started: string[] = [];
    writes.add(() => {
      started.push("intro");
      return first.promise;
    });
    writes.add(async () => {
      started.push("video");
    });

    await flush();
    expect(started).toEqual(["intro"]);

    first.land();
    await writes.settled();
    expect(started).toEqual(["intro", "video"]);
  });

  it("runs the next write after a failed one, and settles, so the reward is never held hostage", async () => {
    const writes = createPendingWrites();
    const first = deferred();
    let hasSecondRun = false;
    writes.add(() => first.promise);
    writes.add(async () => {
      hasSecondRun = true;
    });

    first.fail(new Error("offline"));

    await expect(writes.settled()).resolves.toBeUndefined();
    expect(hasSecondRun).toBe(true);
  });

  it("waits for a write added while it was already waiting", async () => {
    const writes = createPendingWrites();
    const first = deferred();
    const second = deferred();
    writes.add(() => first.promise);

    let isSettled = false;
    const settled = writes.settled().then(() => {
      isSettled = true;
    });
    await flush();
    writes.add(() => second.promise);
    first.land();
    await flush();
    expect(isSettled).toBe(false);

    second.land();
    await settled;
    expect(isSettled).toBe(true);
  });
});
