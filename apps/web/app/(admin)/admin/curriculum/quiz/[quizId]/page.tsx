import { QuizEditorScreen } from "./QuizEditorScreen";

/**
 * `/admin/curriculum/quiz/[quizId]` — the quiz question editor (FR-CMS-03).
 *
 * `params` is a Promise in Next 16 and is awaited here, in the Server Component,
 * so the client boundary starts below it with a plain string prop. The screen
 * itself fetches, for the reason recorded in `frontend.md §2`: the admin session
 * cookie belongs to the API origin.
 */
export default async function AdminQuizPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;

  return <QuizEditorScreen quizId={quizId} />;
}
