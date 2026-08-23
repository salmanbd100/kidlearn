import { afterEach, describe, expect, it, vi } from "vitest";
import { reorderContent } from "./admin-api";

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
