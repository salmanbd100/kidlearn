import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerMediaAsset,
  signMediaUpload,
  uploadToCloudinary,
} from "./media-api";

function stubFetch() {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify({ data: { orderedIds: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubXhr(
  status = 200,
  body = '{"secure_url":"https://res.cloudinary.com/test-cloud/x.png"}',
) {
  const sent: Array<{ url: string; body: unknown }> = [];

  class RecordingXhr {
    status = status;
    responseText = body;
    upload = { addEventListener: () => {} };
    private url = "";
    private listeners = new Map<string, () => void>();

    open(_method: string, url: string) {
      this.url = url;
    }
    addEventListener(event: string, handler: () => void) {
      this.listeners.set(event, handler);
    }
    send(payload: unknown) {
      sent.push({ url: this.url, body: payload });
      this.listeners.get("load")?.();
    }
  }

  vi.stubGlobal("XMLHttpRequest", RecordingXhr);
  return sent;
}

describe("the upload path", () => {
  it("sends the file to Cloudinary and never to our API", async () => {
    const fetchMock = stubFetch();
    const sent = stubXhr();

    const file = new File(["pretend png bytes"], "apple.png", {
      type: "image/png",
    });
    await uploadToCloudinary(file, {
      timestamp: 1_700_000_000,
      folder: "kidlearn/image",
      allowedFormats: "png,jpg,jpeg,webp,gif",
      signature: "deadbeef",
      apiKey: "test-api-key",
      cloudName: "test-cloud",
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(
      "https://api.cloudinary.com/v1_1/test-cloud/auto/upload",
    );
    // Nothing reached our API during the upload; signature and registration are separate calls.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends exactly the signed fields, and no others", async () => {
    // Cloudinary verifies the signature over the computed parameters, so an extra signed field is an `Invalid Signature` at upload time.
    stubFetch();
    const sent = stubXhr();

    await uploadToCloudinary(new File([""], "a.png"), {
      timestamp: 1_700_000_000,
      folder: "kidlearn/image",
      allowedFormats: "png,jpg,jpeg,webp,gif",
      signature: "deadbeef",
      apiKey: "test-api-key",
      cloudName: "test-cloud",
    });

    const form = sent[0].body as FormData;
    expect([...form.keys()].sort()).toEqual([
      "allowed_formats",
      "api_key",
      "file",
      "folder",
      "signature",
      "timestamp",
    ]);
    expect(form.get("allowed_formats")).toBe("png,jpg,jpeg,webp,gif");
  });

  it("reports a refused upload rather than resolving with a broken URL", async () => {
    stubFetch();
    stubXhr(401, "");

    const result = await uploadToCloudinary(new File([""], "a.png"), {
      timestamp: 1,
      folder: "kidlearn/image",
      allowedFormats: "png",
      signature: "x",
      apiKey: "k",
      cloudName: "test-cloud",
    });

    expect(result.ok).toBe(false);
  });

  it("asks our API only for a signature and a registration", async () => {
    const fetchMock = stubFetch();

    await signMediaUpload("image");
    await registerMediaAsset({
      url: "https://res.cloudinary.com/test-cloud/x.png",
      kind: "image",
      language: null,
    });

    expect(
      fetchMock.mock.calls.map((call) => new URL(call[0]).pathname),
    ).toEqual(["/api/admin/media/sign", "/api/admin/media"]);
    // JSON both times — no multipart body, so no file byte is in either request.
    for (const call of fetchMock.mock.calls) {
      expect(typeof call[1]?.body).toBe("string");
    }
  });
});
