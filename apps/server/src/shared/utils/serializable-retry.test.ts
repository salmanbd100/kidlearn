import { Prisma } from "@kidlearn/db";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_SERIALIZATION_RETRIES,
  withSerializationRetry,
} from "./serializable-retry.js";

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

    // The loser of a Serializable race wrote nothing, so the retry succeeds honestly or reports the conflict, never a 500.
    await expect(withSerializationRetry(run)).resolves.toBe("granted");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget rather than looping", async () => {
    const run = vi.fn().mockRejectedValue(serializationFailure());

    await expect(withSerializationRetry(run)).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(MAX_SERIALIZATION_RETRIES + 1);
  });

  it("succeeds on a later retry, not only the first", async () => {
    // An immediate retry re-enters the same contention window; jittered attempts make two simultaneous writers recoverable.
    const run = vi
      .fn()
      .mockRejectedValueOnce(serializationFailure())
      .mockRejectedValueOnce(serializationFailure())
      .mockResolvedValue("granted");

    await expect(withSerializationRetry(run)).resolves.toBe("granted");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("retries when the pool had no connection free to start the transaction", async () => {
    const startTimeout = new Prisma.PrismaClientKnownRequestError(
      "Transaction API error: Unable to start a transaction in the given time.",
      { code: "P2028", clientVersion: "6.19.3" },
    );
    const run = vi
      .fn()
      .mockRejectedValueOnce(startTimeout)
      .mockResolvedValue("granted");

    await expect(withSerializationRetry(run)).resolves.toBe("granted");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not retry a transaction that ran past its timeout", async () => {
    const expired = new Prisma.PrismaClientKnownRequestError(
      "Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction.",
      { code: "P2028", clientVersion: "6.19.3" },
    );
    const run = vi.fn().mockRejectedValue(expired);

    await expect(withSerializationRetry(run)).rejects.toBe(expired);
    expect(run).toHaveBeenCalledTimes(1);
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
