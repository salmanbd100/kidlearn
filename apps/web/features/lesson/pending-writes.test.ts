import { describe, expect, it } from "vitest";
import { createPendingWrites } from "./pending-writes";

describe("createPendingWrites", () => {
  it("settles at once when nothing was added", async () => {
    await expect(createPendingWrites().settled()).resolves.toBeUndefined();
  });

  it("waits for every write added so far", async () => {
    const writes = createPendingWrites();
    let land = () => {};
    writes.add(
      new Promise<void>((resolve) => {
        land = resolve;
      }),
    );

    let isSettled = false;
    const settled = writes.settled().then(() => {
      isSettled = true;
    });
    await Promise.resolve();
    expect(isSettled).toBe(false);

    land();
    await settled;
    expect(isSettled).toBe(true);
  });

  it("settles on a failed write too, so the reward is never held hostage", async () => {
    const writes = createPendingWrites();
    writes.add(Promise.reject(new Error("offline")));

    await expect(writes.settled()).resolves.toBeUndefined();
  });
});
