// `fetch` is stubbed (external boundary, general.md §5); no database is touched. Voice names are the
// config/env.ts defaults, which vitest.setup.ts leaves unset.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateNarration } from "./google-tts.js";

const fetchMock = vi.fn();

/** Only the three members the client reads, so the wide `Response` is narrowed here. */
function synthesised(audio: Buffer): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ audioContent: audio.toString("base64") }),
  } as unknown as Response;
}

function body(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("which voice speaks", () => {
  it("sends Bangla text to a Bangla voice and language code", async () => {
    // FR-I18N-05 rests on this: an English voice reads Bangla text without complaint, and the clip plays.
    fetchMock.mockResolvedValue(synthesised(Buffer.from([1, 2, 3])));

    await generateNarration("একটি ছোট খরগোশ", "bn");

    expect(body().voice).toEqual({
      languageCode: "bn-IN",
      name: "bn-IN-Standard-A",
    });
  });

  it("sends English text to an English voice and language code", async () => {
    fetchMock.mockResolvedValue(synthesised(Buffer.from([1])));

    await generateNarration("A small rabbit", "en");

    expect(body().voice).toEqual({
      languageCode: "en-US",
      name: "en-US-Standard-C",
    });
  });

  it("derives the language code from the voice name rather than a second setting", async () => {
    // Two independent variables would let a deployment pair an `en-US` code with a `bn-IN` voice, with no error to show.
    fetchMock.mockResolvedValue(synthesised(Buffer.from([1])));

    await generateNarration("A small rabbit", "en");

    const voice = body().voice as { languageCode: string; name: string };
    expect(voice.name.startsWith(voice.languageCode)).toBe(true);
  });
});

describe("the request", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(synthesised(Buffer.from([9])));
  });

  it("posts the text verbatim and asks for mp3", async () => {
    await generateNarration("Hello there", "en");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(body().input).toEqual({ text: "Hello there" });
    expect(body().audioConfig).toEqual({ audioEncoding: "MP3" });
  });

  it("authenticates with the api key in a header, not the URL", async () => {
    await generateNarration("Hello there", "en");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://texttospeech.googleapis.com/v1/text:synthesize",
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      "x-goog-api-key": "test-google-tts-key",
    });
  });

  it("bounds the call, so a hung connection cannot hold the job open", async () => {
    await generateNarration("Hello there", "en");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("the answer", () => {
  it("decodes the base64 envelope into the clip's own bytes", async () => {
    // Base64 inside JSON rather than raw bytes; decoded here so nothing downstream knows.
    fetchMock.mockResolvedValue(synthesised(Buffer.from([7, 8, 9])));

    const audio = await generateNarration("Hello", "en");

    expect(audio).toBeInstanceOf(Buffer);
    expect([...audio]).toEqual([7, 8, 9]);
  });

  it("throws rather than returning an empty clip when the envelope has no audio", async () => {
    // A zero-byte "clip" would upload, attach and pass a review as silence.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response);

    await expect(generateNarration("Hello", "en")).rejects.toThrow(
      "Google TTS returned no audio content",
    );
  });
});

describe("a provider failure", () => {
  it("throws with the status and the provider's own body", async () => {
    // Verbatim: the body names the fault, and the job record keeps whatever is thrown (FR-AI-08).
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => '{"error":{"status":"PERMISSION_DENIED"}}',
    } as unknown as Response);

    await expect(generateNarration("Hello", "en")).rejects.toThrow(
      'Google TTS 403: {"error":{"status":"PERMISSION_DENIED"}}',
    );
  });

  it("does not return a buffer built from an error body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "RESOURCE_EXHAUSTED",
    } as unknown as Response);

    await expect(generateNarration("Hello", "bn")).rejects.toThrow(
      "Google TTS 429",
    );
  });
});
