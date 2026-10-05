/**
 * Own file because it mocks `cloudinary` wholesale (an external boundary allowed by `general.md §5`),
 * which the route suite cannot, as it asserts a real signature.
 * The message is the whole audit trail for a failed job; the SDK hands API failures as plain objects, so
 * naive coercion yields "[object Object]".
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

const { uploadBuffer } = await import("./media.service.js");

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
    // The SDK passes `{ message, name, http_code }`, not an `Error`; `String()` gives "[object Object]".
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
    // Already an `Error`: rewrapping would lose the stack.
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
