import { Prisma } from "@kidlearn/db";
import { describe, expect, it, vi } from "vitest";
import { withSerializationRetry } from "./serializable-retry.js";

function serializationFailure(): Error {
  return new Prisma.PrismaClientKnownRequestError(
    "Transaction failed due to a write conflict or a deadlock",
    { code: "P2034", clientVersion: "6.19.3" },
  );
}

describe("withSerializationRetry", () => {
  it("returns the first attempt's value when nothing aborted", async () => {
    const run = vi.fn().mockResolvedValue("granted");

    await expect(withSerializationRetry(run)).resolves.toBe("granted");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs a second time when Postgres aborted the first", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(serializationFailure())
      .mockResolvedValue("granted");

    // The loser of a Serializable race wrote nothing, so the retry re-reads
    // under the winner's rows and either succeeds honestly or reports the
    // conflict — what it must never do is surface a 500 to a four-year-old.
    await expect(withSerializationRetry(run)).resolves.toBe("granted");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry rather than looping", async () => {
    const run = vi.fn().mockRejectedValue(serializationFailure());

    await expect(withSerializationRetry(run)).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("rethrows any other Prisma error without retrying", async () => {
    const unique = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "6.19.3" },
    );
    const run = vi.fn().mockRejectedValue(unique);

    await expect(withSerializationRetry(run)).rejects.toBe(unique);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rethrows a plain error without retrying", async () => {
    const boom = new Error("boom");
    const run = vi.fn().mockRejectedValue(boom);

    await expect(withSerializationRetry(run)).rejects.toBe(boom);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
