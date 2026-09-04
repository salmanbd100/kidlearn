/**
 * `uploadBuffer`'s failure path (file 36, FR-AI-08).
 *
 * Its own file rather than an addition to the media route tests, because it has to
 * mock the `cloudinary` module wholesale — `general.md §5` allows that as an
 * external network boundary, but the route suite asserts a real signature derived
 * from the test credentials and would lose it.
 *
 * What is under test is the *message*, which is unusual enough to say why. A job
 * that fails records `rawOutput.error` and stops; that string is the entire audit
 * trail for the failure, and an admin reading it has to be able to tell a rotated
 * credential from a rate limit. The SDK makes that easy to get wrong: it hands the
 * callback a plain object for every API-level failure, so the obvious coercion
 * produces `"[object Object]"` and destroys the diagnosis silently.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  uploadStream: vi.fn(),
}));

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    utils: { api_sign_request: vi.fn(() => "signature") },
    uploader: { upload_stream: sdk.uploadStream },
  },
}));

const { uploadBuffer } = await import("./mediaService.js");

/** Stands in for the SDK's stream, answering the callback with `error`. */
function respondWith(error: unknown, result?: unknown) {
  sdk.uploadStream.mockImplementation(
    (
      _options: unknown,
      callback: (error: unknown, result: unknown) => void,
    ) => ({
      end: () => callback(error, result),
    }),
  );
}

beforeEach(() => {
  sdk.uploadStream.mockReset();
});

describe("what a failed upload records", () => {
  it("keeps the message and status from Cloudinary's plain-object error", async () => {
    // The shape the SDK actually passes: `{ message, name, http_code }`, not an
    // `Error`. `String()` on it is "[object Object]", which is what a reviewer
    // would otherwise find in the job row.
    respondWith({
      message: "Invalid Signature abc123. String to sign - 'folder=kidlearn'.",
      name: "Error",
      http_code: 401,
    });

    await expect(
      uploadBuffer(Buffer.from("mp3"), {
        folder: "kidlearn/audio",
        resourceType: "video",
      }),
    ).rejects.toThrow(/Invalid Signature abc123/);
  });

  it("names the HTTP status, so a rate limit reads differently from a bad key", async () => {
    respondWith({ message: "Rate limited", name: "Error", http_code: 420 });

    await expect(
      uploadBuffer(Buffer.from("png"), {
        folder: "kidlearn/image",
        resourceType: "image",
      }),
    ).rejects.toThrow(/HTTP 420/);
  });

  it("never surrenders the diagnosis to [object Object]", async () => {
    respondWith({
      message: "Invalid Signature",
      name: "Error",
      http_code: 401,
    });

    await expect(
      uploadBuffer(Buffer.from("mp3"), {
        folder: "kidlearn/audio",
        resourceType: "video",
      }),
    ).rejects.not.toThrow(/\[object Object\]/);
  });

  it("passes a genuine socket Error through untouched", async () => {
    // The one case that already arrived as an `Error`: rewrapping it would lose
    // the stack that says which socket died.
    const socketError = new Error("ECONNRESET");
    respondWith(socketError);

    await expect(
      uploadBuffer(Buffer.from("mp3"), {
        folder: "kidlearn/audio",
        resourceType: "video",
      }),
    ).rejects.toBe(socketError);
  });

  it("still rejects an otherwise-successful response with no secure_url", async () => {
    respondWith(undefined, { public_id: "kidlearn/audio/clip" });

    await expect(
      uploadBuffer(Buffer.from("mp3"), {
        folder: "kidlearn/audio",
        resourceType: "video",
      }),
    ).rejects.toThrow(/no secure_url/);
  });

  it("resolves with the delivery URL when the upload succeeds", async () => {
    respondWith(undefined, {
      secure_url: "https://res.cloudinary.com/c/a.mp3",
    });

    await expect(
      uploadBuffer(Buffer.from("mp3"), {
        folder: "kidlearn/audio",
        resourceType: "video",
      }),
    ).resolves.toBe("https://res.cloudinary.com/c/a.mp3");
  });
});
