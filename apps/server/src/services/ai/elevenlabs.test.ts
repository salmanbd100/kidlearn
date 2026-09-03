/**
 * The ElevenLabs client (file 36, FR-AI-04, FR-I18N-05).
 *
 * `fetch` is stubbed, which `general.md §5` permits explicitly: an external
 * network boundary is the one allowed mock. Nothing here touches the database, so
 * the Prisma exception does not apply.
 *
 * The voice ids are the ones `vitest.setup.ts` puts in the environment.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateNarration } from "./elevenlabs.js";

const fetchMock = vi.fn();

function mp3Response(bytes: Uint8Array): Response {
  // Only the three members the client reads are supplied, so the wide `Response`
  // type is narrowed at this stub boundary.
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("which voice speaks", () => {
  it("sends Bangla text to the Bangla voice", async () => {
    // The whole of FR-I18N-05 rests on this: the multilingual model will read
    // Bangla in the English voice without complaining, and the clip that comes
    // back plays.
    fetchMock.mockResolvedValue(mp3Response(new Uint8Array([1, 2, 3])));

    await generateNarration("একটি ছোট খরগোশ", "bn");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/test-voice-bn",
    );
  });

  it("sends English text to the English voice", async () => {
    fetchMock.mockResolvedValue(mp3Response(new Uint8Array([1])));

    await generateNarration("A small rabbit", "en");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/test-voice-en",
    );
  });
});

describe("the request", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(mp3Response(new Uint8Array([9])));
  });

  it("asks the multilingual model for the text verbatim", async () => {
    await generateNarration("Hello there", "en");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      text: "Hello there",
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.6, similarity_boost: 0.8 },
    });
  });

  it("authenticates with the api key header and asks for mp3", async () => {
    await generateNarration("Hello there", "en");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "xi-api-key": "test-elevenlabs-key",
      accept: "audio/mpeg",
    });
  });

  it("returns the response bytes as a buffer", async () => {
    fetchMock.mockResolvedValue(mp3Response(new Uint8Array([7, 8, 9])));

    const audio = await generateNarration("Hello", "en");

    expect(audio).toBeInstanceOf(Buffer);
    expect([...audio]).toEqual([7, 8, 9]);
  });
});

describe("a provider failure", () => {
  it("throws with the status and the provider's own body", async () => {
    // Verbatim, because the body is what names the fault — an unknown voice id,
    // an exhausted quota — and the job record keeps whatever is thrown (FR-AI-08).
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"detail":{"status":"invalid_api_key"}}',
    } as unknown as Response);

    await expect(generateNarration("Hello", "en")).rejects.toThrow(
      'ElevenLabs 401: {"detail":{"status":"invalid_api_key"}}',
    );
  });

  it("does not return a buffer built from an error body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "quota_exceeded",
    } as unknown as Response);

    await expect(generateNarration("Hello", "bn")).rejects.toThrow(
      "ElevenLabs 429",
    );
  });
});
