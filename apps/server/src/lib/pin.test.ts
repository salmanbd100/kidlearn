import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "./pin.js";

describe("PIN hashing", () => {
  it("accepts the PIN it hashed", async () => {
    const hash = await hashPin("4821");

    await expect(verifyPin(hash, "4821")).resolves.toBe(true);
  });

  it("rejects a different PIN", async () => {
    const hash = await hashPin("4821");

    await expect(verifyPin(hash, "4822")).resolves.toBe(false);
  });

  it("never stores the PIN in recoverable form", async () => {
    const hash = await hashPin("4821");

    expect(hash).not.toContain("4821");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("salts each hash, so two parents with the same PIN do not share a digest", async () => {
    const [first, second] = await Promise.all([
      hashPin("0000"),
      hashPin("0000"),
    ]);

    expect(first).not.toBe(second);
  });

  it("returns false instead of throwing when the stored hash is not an argon2 digest", async () => {
    // A legacy or corrupted column value must fail closed, not 500.
    await expect(verifyPin("not-a-hash", "4821")).resolves.toBe(false);
  });
});
