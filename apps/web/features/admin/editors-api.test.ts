import { afterEach, describe, expect, it, vi } from "vitest";
import { updateContent } from "./content-api";
import { createQuestion, deleteQuestion, replaceQuestion } from "./editors-api";

/** A JSON 200 for every request, recorded. */
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

describe("the ?jobId breadcrumb", () => {
  const JOB_ID = "aaaaaaaa-0000-4000-8000-000000000001";
  const QUIZ_ID = "bbbbbbbb-0000-4000-8000-000000000001";
  const QUESTION_ID = "cccccccc-0000-4000-8000-000000000001";

  const urlOf = (fetchMock: ReturnType<typeof stubFetch>): string =>
    String(fetchMock.mock.calls[0][0]);

  const question = { format: "mcq" as const, definition: {} };

  it("appends it to a question create", async () => {
    const fetchMock = stubFetch();

    await createQuestion(QUIZ_ID, question, JOB_ID);

    expect(urlOf(fetchMock)).toContain(`?jobId=${JOB_ID}`);
  });

  it("appends it to a question replace and a question delete", async () => {
    const onReplace = stubFetch();
    await replaceQuestion(QUIZ_ID, QUESTION_ID, question, JOB_ID);
    expect(urlOf(onReplace)).toContain(`?jobId=${JOB_ID}`);

    vi.unstubAllGlobals();
    const onDelete = stubFetch();
    await deleteQuestion(QUIZ_ID, QUESTION_ID, JOB_ID);
    expect(urlOf(onDelete)).toContain(`?jobId=${JOB_ID}`);
  });

  it("appends it to a curriculum edit", async () => {
    const fetchMock = stubFetch();

    await updateContent("lessons", QUIZ_ID, { title: "A" }, JOB_ID);

    expect(urlOf(fetchMock)).toContain(`?jobId=${JOB_ID}`);
  });

  it("sends no query at all when there is no job", async () => {
    // The ordinary CMS path. An empty `?jobId=` would be a uuid the server's
    // schema rejects, turning every unrelated save into a `400`.
    const fetchMock = stubFetch();

    await createQuestion(QUIZ_ID, question);

    expect(urlOf(fetchMock)).not.toContain("?");
  });
});
