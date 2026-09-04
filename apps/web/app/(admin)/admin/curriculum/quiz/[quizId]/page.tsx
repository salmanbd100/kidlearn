import { QuizEditorScreen } from "./QuizEditorScreen";

/**
 * `/admin/curriculum/quiz/[quizId]` — the quiz question editor (FR-CMS-03).
 *
 * `params` and `searchParams` are Promises in Next 16 and are awaited here, in
 * the Server Component, so the client boundary starts below with plain string
 * props. The screen itself fetches, for the reason recorded in `frontend.md §2`:
 * the admin session cookie belongs to the API origin.
 *
 * `?jobId=…` is the review queue's Edit deep-link (file 37, FR-AI-07). Passed
 * down so every save from this screen records `edit_then_approve` on that job.
 * Read here as a string rather than validated: the server's params schema is the
 * authority, and a malformed value is its `400` to give.
 */
export default async function AdminQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ quizId: string }>;
  searchParams: Promise<{ jobId?: string | string[] }>;
}) {
  const { quizId } = await params;
  const { jobId } = await searchParams;

  return (
    <QuizEditorScreen
      quizId={quizId}
      jobId={typeof jobId === "string" ? jobId : undefined}
    />
  );
}
