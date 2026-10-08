import { QuizEditorScreen } from "./QuizEditorScreen";

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
