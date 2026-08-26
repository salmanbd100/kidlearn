import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerMediaAsset,
  reorderContent,
  signMediaUpload,
  uploadToCloudinary,
} from "./admin-api";

/**
 * What a reorder actually puts on the wire.
 *
 * The server validates `orderedIds` against the sibling set `includeArchived`
 * selects, so a tree loaded with archived rows showing has to say so — omitting
 * the flag from that view made every drag a `400 VALIDATION_FAILED`, because the
 * payload carried an id the server had filtered out of its own expectation.
 *
 * Asserted here rather than in the screen's suite: dnd-kit needs a real layout to
 * resolve a drop and jsdom gives it none, so the request body is the last point
 * where this is observable without mocking the drag library itself.
 */
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

const bodyOf = (fetchMock: ReturnType<typeof stubFetch>): unknown =>
  JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

const IDS = ["a", "b", "c"];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reorderContent", () => {
  it("omits the flag on the default view, which hides archived rows", async () => {
    const fetchMock = stubFetch();

    await reorderContent("topics", IDS, "subject-1");

    expect(bodyOf(fetchMock)).toEqual({
      orderedIds: IDS,
      parentId: "subject-1",
    });
  });

  it("sends the flag when the tree was loaded with archived rows", async () => {
    const fetchMock = stubFetch();

    await reorderContent("topics", IDS, "subject-1", true);

    expect(bodyOf(fetchMock)).toEqual({
      orderedIds: IDS,
      parentId: "subject-1",
      includeArchived: true,
    });
  });

  it("omits parentId for subjects, which have none", async () => {
    const fetchMock = stubFetch();

    await reorderContent("subjects", IDS);

    expect(bodyOf(fetchMock)).toEqual({ orderedIds: IDS });
  });

  it("does not retry — a reorder is a write, not a read", async () => {
    const fetchMock = stubFetch();

    await reorderContent("subjects", IDS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * Where an upload's bytes actually go (file 33, FR-CMS-02).
 *
 * The acceptance criterion is a network-tab observation — "only `/sign` and
 * `/media` JSON calls hit our API" — and this is that observation made
 * mechanically. It matters because the alternative implementation, proxying the
 * file through `apps/server`, is the obvious one and would pass every other test
 * in this file.
 */

/** The minimum of `XMLHttpRequest` `uploadToCloudinary` drives, recorded. */
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
      signature: "deadbeef",
      apiKey: "test-api-key",
      cloudName: "test-cloud",
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(
      "https://api.cloudinary.com/v1_1/test-cloud/auto/upload",
    );
    // Nothing at all reached our API during the upload itself: the signature and
    // the registration are separate calls the caller makes around it.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends exactly the signed fields, and no others", async () => {
    // Cloudinary verifies the signature over the parameters it was computed from,
    // so an extra *signed* field here is an `Invalid Signature` at upload time
    // rather than a compile error.
    stubFetch();
    const sent = stubXhr();

    await uploadToCloudinary(new File([""], "a.png"), {
      timestamp: 1_700_000_000,
      folder: "kidlearn/image",
      signature: "deadbeef",
      apiKey: "test-api-key",
      cloudName: "test-cloud",
    });

    const form = sent[0].body as FormData;
    expect([...form.keys()].sort()).toEqual([
      "api_key",
      "file",
      "folder",
      "signature",
      "timestamp",
    ]);
  });

  it("reports a refused upload rather than resolving with a broken URL", async () => {
    stubFetch();
    stubXhr(401, "");

    const result = await uploadToCloudinary(new File([""], "a.png"), {
      timestamp: 1,
      folder: "kidlearn/image",
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
