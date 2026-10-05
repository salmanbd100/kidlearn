import { afterEach, describe, expect, it, vi } from "vitest";
import { reorderContent } from "./content-api";

/** What a reorder actually puts on the wire. */
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
