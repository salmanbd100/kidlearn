"use client";

import type { AdminQuizDetail, AdminQuizQuestion } from "@kidlearn/types";
import { isContentEditable } from "@kidlearn/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kidlearn/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusChip } from "@/app/(admin)/admin/curriculum/StatusChip";
import { TransitionButtons } from "@/app/(admin)/admin/curriculum/TransitionButtons";
import { GenerateNarrationButton } from "@/components/admin/GenerateNarrationButton";
import { QuizQuestionEditor } from "@/components/admin/QuizQuestionEditor";
import {
  draftFromDefinition,
  emptyQuestionDraft,
  type QuestionDraft,
} from "@/components/admin/quiz-draft";
import {
  createQuestion,
  deleteQuestion,
  fetchQuiz,
  replaceQuestion,
  transitionEditorContent,
} from "@/lib/admin-api";
import { ADMIN_ROUTES } from "@/lib/admin-routes";

/**
 * `/admin/curriculum/quiz/[quizId]` — one quiz's ordered questions (FR-CMS-03).
 *
 * **The list re-reads after every write.** `sortOrder` is the server's, and a
 * delete renumbers the survivors, so a client splicing its own idea of the list
 * back in would be right until the first time it was not — the same rule the
 * curriculum tree follows.
 *
 * **A published quiz is read-only here**, matching the server, which refuses a
 * question edit while the quiz is published. The buttons that would earn a `409`
 * are disabled with the reason stated rather than left to produce one.
 *
 * **`jobId` is the review queue's Edit deep-link (file 37, FR-AI-07).** When it
 * is present every save here carries it, and the server records
 * `edit_then_approve` on that job in the same request. It rides on the save
 * rather than following it, so a browser closed mid-flow cannot leave a
 * rewritten quiz whose audit trail says nobody rewrote it (FR-AI-08).
 */

type DialogState =
  | { kind: "closed" }
  | { kind: "new"; draft: QuestionDraft }
  | { kind: "edit"; question: AdminQuizQuestion; draft: QuestionDraft };

export interface QuizEditorScreenProps {
  quizId: string;
  /** The `AIGenerationJob` this edit belongs to, when opened from the queue. */
  jobId?: string;
}

export function QuizEditorScreen({ quizId, jobId }: QuizEditorScreenProps) {
  const [quiz, setQuiz] = useState<AdminQuizDetail>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    const result = await fetchQuiz(quizId);
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setQuiz(result.data);
    setStatus("ready");
  }, [quizId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading") {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (status === "error" || quiz === undefined) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="font-semibold text-foreground text-xl">Quiz</h1>
        <p className="text-muted-foreground text-sm">
          That quiz could not be loaded.
        </p>
        <Button asChild variant="outline">
          <Link href={ADMIN_ROUTES.curriculum}>Back to curriculum</Link>
        </Button>
      </div>
    );
  }

  const isEditable = isContentEditable(quiz.status);

  async function run(
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
    successNotice: string,
  ): Promise<boolean> {
    setIsBusy(true);
    setNotice(undefined);
    setError(undefined);

    const result = await action();
    if (!result.ok) {
      setError(result.error?.message ?? "That did not work.");
      setIsBusy(false);
      return false;
    }

    await load();
    setNotice(successNotice);
    setIsBusy(false);
    return true;
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-foreground text-xl">
              {quiz.title ?? "Untitled quiz"}
            </h1>
            <StatusChip status={quiz.status} />
          </div>
          <p className="text-muted-foreground text-xs">
            {quiz.questionCount} question
            {quiz.questionCount === 1 ? "" : "s"}, asked in this order.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost">
            <Link href={ADMIN_ROUTES.curriculum}>Back</Link>
          </Button>

          {/* File 36 — prompt narration per question per locale (FR-AI-04,
              FR-QUIZ-05). Offered whatever the quiz's status: recording a clip
              changes nothing a child can reach, since the audio is attached on
              approval and not here. */}
          <GenerateNarrationButton
            entity="quiz"
            id={quizId}
            isBusy={isBusy}
            onGenerated={(message) => {
              setError(undefined);
              setNotice(message);
            }}
            onError={(message) => {
              setNotice(undefined);
              setError(message);
            }}
          />

          <Button
            type="button"
            disabled={!isEditable || isBusy}
            onClick={() => {
              setNotice(undefined);
              setError(undefined);
              setDialog({ kind: "new", draft: emptyQuestionDraft("mcq") });
            }}
          >
            Add question
          </Button>
        </div>
      </header>

      {isEditable ? null : (
        <p className="text-muted-foreground text-xs">
          This quiz is published, so its questions cannot be changed. Withdraw
          it to draft first — that removes it from students immediately.
        </p>
      )}

      <TransitionButtons
        status={quiz.status}
        isBusy={isBusy}
        onTransition={(hops) => void runHops(hops)}
      />

      {notice ? (
        <p
          role="status"
          className="rounded-[var(--radius)] border border-border bg-muted px-3 py-2 text-foreground text-sm"
        >
          {notice}
        </p>
      ) : null}

      {error && dialog.kind === "closed" ? (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-destructive bg-destructive/10 px-3 py-2 text-destructive text-sm"
        >
          {error}
        </p>
      ) : null}

      {quiz.questions.length === 0 ? (
        <p className="text-muted-foreground text-sm">No questions yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {quiz.questions.map((question, index) => (
            <li
              key={question.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-card p-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium text-card-foreground text-sm">
                  {index + 1}. {question.definition.prompt.en}
                </span>
                <span className="text-muted-foreground text-xs">
                  {question.format}
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!isEditable || isBusy}
                  onClick={() => {
                    setNotice(undefined);
                    setError(undefined);
                    setDialog({
                      kind: "edit",
                      question,
                      draft: draftFromDefinition(question.definition),
                    });
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!isEditable || isBusy}
                  onClick={() =>
                    void run(
                      () => deleteQuestion(quizId, question.id, jobId),
                      "Question removed; the rest were renumbered.",
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Dialog
        open={dialog.kind !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDialog({ kind: "closed" });
        }}
      >
        <DialogContent size="lg" closeLabel="Close">
          {dialog.kind === "closed" ? null : (
            <>
              <DialogHeader gutter="inset">
                <DialogTitle>
                  {dialog.kind === "new" ? "New question" : "Edit question"}
                </DialogTitle>
                <DialogDescription>
                  Validated against the shared schema as you type. The preview
                  is the renderer a child gets.
                </DialogDescription>
              </DialogHeader>

              <QuizQuestionEditor
                // Keyed so opening a different question remounts the form rather
                // than feeding new initial state into a mounted one.
                key={dialog.kind === "edit" ? dialog.question.id : "new"}
                initial={dialog.draft}
                isBusy={isBusy}
                error={error}
                onCancel={() => setDialog({ kind: "closed" })}
                onSubmit={(payload) => void submit(payload)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

  async function submit(payload: {
    format: AdminQuizQuestion["format"];
    definition: unknown;
  }) {
    const succeeded =
      dialog.kind === "edit"
        ? await run(
            () => replaceQuestion(quizId, dialog.question.id, payload, jobId),
            "Question saved.",
          )
        : await run(
            () => createQuestion(quizId, payload, jobId),
            "Question added at the end.",
          );

    if (succeeded) setDialog({ kind: "closed" });
  }

  /**
   * Applies each hop in order and stops at the first refusal — sequential rather
   * than concurrent because the second hop is only legal from the status the first
   * one wrote. Same reasoning as the curriculum tree.
   */
  async function runHops(hops: AdminQuizDetail["status"][]) {
    setIsBusy(true);
    setNotice(undefined);
    setError(undefined);

    for (const to of hops) {
      const result = await transitionEditorContent("quizzes", quizId, to);
      if (!result.ok) {
        setError(result.error.message);
        await load();
        setIsBusy(false);
        return;
      }
    }

    await load();
    setNotice(`Moved to ${hops[hops.length - 1].replace("_", " ")}.`);
    setIsBusy(false);
  }
}
