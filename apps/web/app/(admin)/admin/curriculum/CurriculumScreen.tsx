"use client";

import type {
  AdminLesson,
  AdminSubject,
  AdminTopic,
  AdminWorld,
  ContentResourceName,
  ContentStatusValue,
  OrderableContentResourceName,
} from "@kidlearn/types";
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
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ContentDraft,
  createContent,
  createQuiz,
  fetchLessons,
  fetchSubjects,
  fetchTopics,
  fetchWorlds,
  reorderContent,
  transitionContent,
  updateContent,
} from "@/lib/admin-api";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { type ColumnItem, ContentColumn } from "./ContentColumn";
import { ContentForm } from "./ContentForm";
import { GenerateLessonDialog } from "./GenerateLessonDialog";
import { GenerateQuizButton } from "./GenerateQuizButton";
import { LessonForm } from "./LessonForm";
import { StatusChip } from "./StatusChip";
import { TransitionButtons } from "./TransitionButtons";

/**
 * `/admin/curriculum` — the curriculum tree (file 32, FR-CURR-04, FR-CMS-01,
 * FR-CMS-06).
 *
 * **Three panes, Subject → Topic → Lesson**, with worlds edited in a fourth pane
 * of their own. A world is not a level of this hierarchy — it is a theme a lesson
 * points at, shared across subjects — so nesting it would draw a tree the data
 * does not have.
 *
 * **The whole tree is fetched once and filtered in the browser.** A curriculum
 * for ages 3–6 is a few hundred rows at most; four requests on mount beat a
 * request per expand on an API that sleeps on its free tier (NFR-PERF-04), and it
 * means a reorder can settle against a list already in memory.
 *
 * **Every mutation re-reads its list rather than patching state from the
 * response.** The server owns `sortOrder`, `status`, `updatedBy` and
 * `updatedAt`, and a client that spliced its own idea of a row back into the list
 * would be right until the first time it was not. The one exception is the drag
 * itself, which is applied optimistically so the list does not jump under the
 * cursor, then reverted if the write is refused.
 */

type DialogState =
  | { kind: "closed" }
  | { kind: "create"; resource: ContentResourceName }
  | { kind: "edit"; resource: ContentResourceName };

export function CurriculumScreen() {
  const [worlds, setWorlds] = useState<AdminWorld[]>([]);
  const [subjects, setSubjects] = useState<AdminSubject[]>([]);
  const [topics, setTopics] = useState<AdminTopic[]>([]);
  const [lessons, setLessons] = useState<AdminLesson[]>([]);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>();
  const [selectedTopicId, setSelectedTopicId] = useState<string>();
  const [selectedLessonId, setSelectedLessonId] = useState<string>();
  const [selectedWorldId, setSelectedWorldId] = useState<string>();

  const [includeArchived, setIncludeArchived] = useState(false);
  const [status, setStatus] = useState<
    "loading" | "waking" | "ready" | "error"
  >("loading");
  const [isBusy, setIsBusy] = useState(false);
  // Two channels, not one. They render differently — a success is a `role=status`
  // banner, a failure is a `role=alert` inside the open form — and sharing a
  // variable meant the last success was still in it when the next dialog opened,
  // announcing "Created as a draft." as an error on an untouched form.
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  // Its own flag rather than a `DialogState` variant: the generator is not a form
  // over a resource — it has no row to edit, its own submit path, and its own
  // dialog — so folding it into that union would mean guarding every branch that
  // reads `dialog.resource`.
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);

  /** Both channels are stale the moment a new intent starts. */
  function clearMessages() {
    setNotice(undefined);
    setError(undefined);
  }

  function openDialog(next: DialogState) {
    clearMessages();
    setDialog(next);
  }

  const load = useCallback(async () => {
    setStatus("loading");
    const options = { includeArchived };

    const [worldResult, subjectResult, topicResult, lessonResult] =
      await Promise.all([
        fetchWorlds({ ...options, onColdStart: () => setStatus("waking") }),
        fetchSubjects(options),
        fetchTopics(options),
        fetchLessons(options),
      ]);

    if (
      !worldResult.ok ||
      !subjectResult.ok ||
      !topicResult.ok ||
      !lessonResult.ok
    ) {
      setStatus("error");
      return;
    }

    setWorlds(worldResult.data);
    setSubjects(subjectResult.data);
    setTopics(topicResult.data);
    setLessons(lessonResult.data);
    setStatus("ready");
  }, [includeArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleTopics = useMemo(
    () => topics.filter((topic) => topic.subjectId === selectedSubjectId),
    [topics, selectedSubjectId],
  );

  const visibleLessons = useMemo(
    () => lessons.filter((lesson) => lesson.topicId === selectedTopicId),
    [lessons, selectedTopicId],
  );

  const selectedLesson =
    selectedWorldId === undefined
      ? lessons.find((lesson) => lesson.id === selectedLessonId)
      : undefined;

  const selected = useSelection({
    worlds,
    subjects,
    topics,
    lessons,
    selectedWorldId,
    selectedSubjectId,
    selectedTopicId,
    selectedLessonId,
  });

  /** Runs a write, reports its failure in the admin's words, then re-reads. */
  async function run(
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
    successNotice: string,
  ): Promise<boolean> {
    setIsBusy(true);
    clearMessages();

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

  /**
   * Applies each hop in order and stops at the first refusal.
   *
   * Sequential rather than concurrent, and not merely for tidiness: the second
   * hop is only legal from the status the first one wrote, so firing both at once
   * would race the server into rejecting one of them.
   */
  async function handleTransition(
    resource: ContentResourceName,
    id: string,
    hops: ContentStatusValue[],
  ) {
    setIsBusy(true);
    clearMessages();

    for (const to of hops) {
      const result = await transitionContent(resource, id, to);
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

  /**
   * Reorders optimistically, then lets the server's answer stand.
   *
   * The revert on failure is the point: a refusal means this tab's list was not
   * the sibling set the server has — somebody else created a row — and leaving
   * the optimistic order on screen would show an order that was never saved.
   */
  async function handleReorder(
    resource: OrderableContentResourceName,
    orderedIds: string[],
    parentId: string | undefined,
    apply: (orderedIds: string[]) => void,
  ) {
    apply(orderedIds);
    clearMessages();

    // `includeArchived` has to match the list that was dragged: the server
    // validates the payload against the sibling set that flag selects, so a tree
    // showing archived rows must say so or every drag from that view is a 400.
    const result = await reorderContent(
      resource,
      orderedIds,
      parentId,
      includeArchived,
    );
    if (!result.ok) {
      setError(`${result.error.message} Reloading the tree.`);
    }
    await load();
  }

  if (status === "error") {
    return (
      <ErrorState
        onRetry={() => {
          void load();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-semibold text-foreground text-xl">Curriculum</h1>
          <p className="text-muted-foreground text-xs">
            Publishing a row makes it visible to children immediately.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={includeArchived ? "default" : "outline"}
            aria-pressed={includeArchived}
            onClick={() => setIncludeArchived((current) => !current)}
          >
            {includeArchived ? "Hide archived" : "Show archived"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={status === "loading" || status === "waking"}
            onClick={() => void load()}
          >
            Refresh
          </Button>
          <Button
            type="button"
            disabled={isBusy}
            onClick={() => {
              clearMessages();
              setIsGenerateOpen(true);
            }}
          >
            Generate lesson
          </Button>
        </div>
      </header>

      {status === "waking" ? (
        <p className="text-muted-foreground text-xs">Waking the API up…</p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="rounded-[var(--radius)] border border-border bg-muted px-3 py-2 text-foreground text-sm"
        >
          {notice}
        </p>
      ) : null}

      {/* A failure from a transition or a reorder has no form to render itself
          in — only a submit does. */}
      {error && dialog.kind === "closed" ? (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-destructive bg-destructive/10 px-3 py-2 text-destructive text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row">
        <ContentColumn
          title="Subjects"
          items={subjects.map(toColumnItem)}
          selectedId={selectedSubjectId}
          emptyHint="No subjects yet."
          onSelect={(id) => {
            setSelectedSubjectId(id);
            setSelectedTopicId(undefined);
            setSelectedLessonId(undefined);
            setSelectedWorldId(undefined);
          }}
          onCreate={() => openDialog({ kind: "create", resource: "subjects" })}
          onReorder={(orderedIds) =>
            void handleReorder("subjects", orderedIds, undefined, (ids) =>
              setSubjects(reorderLocally(subjects, ids)),
            )
          }
        />

        <ContentColumn
          title="Topics"
          items={visibleTopics.map(toColumnItem)}
          selectedId={selectedTopicId}
          isDisabled={selectedSubjectId === undefined}
          emptyHint={
            selectedSubjectId === undefined
              ? "Pick a subject."
              : "No topics in this subject yet."
          }
          onSelect={(id) => {
            setSelectedTopicId(id);
            setSelectedLessonId(undefined);
            setSelectedWorldId(undefined);
          }}
          onCreate={() => openDialog({ kind: "create", resource: "topics" })}
          onReorder={(orderedIds) =>
            void handleReorder("topics", orderedIds, selectedSubjectId, (ids) =>
              setTopics(reorderWithinParent(topics, ids)),
            )
          }
        />

        <ContentColumn
          title="Lessons"
          items={visibleLessons.map((lesson) => ({
            id: lesson.id,
            label: lesson.title,
            status: lesson.status,
          }))}
          selectedId={selectedLessonId}
          isDisabled={selectedTopicId === undefined}
          emptyHint={
            selectedTopicId === undefined
              ? "Pick a topic."
              : "No lessons in this topic yet."
          }
          onSelect={(id) => {
            setSelectedLessonId(id);
            setSelectedWorldId(undefined);
          }}
          onCreate={() => openDialog({ kind: "create", resource: "lessons" })}
          onReorder={(orderedIds) =>
            void handleReorder("lessons", orderedIds, selectedTopicId, (ids) =>
              setLessons(reorderWithinParent(lessons, ids)),
            )
          }
        />

        <ContentColumn
          title="Worlds"
          items={worlds.map(toColumnItem)}
          selectedId={selectedWorldId}
          emptyHint="No worlds yet."
          onSelect={(id) => {
            setSelectedWorldId(id);
            setSelectedLessonId(undefined);
          }}
          onCreate={() => openDialog({ kind: "create", resource: "worlds" })}
          // No `onReorder`: `World` carries no `sortOrder`. Worlds are chosen on
          // a map, not read in sequence.
        />
      </div>

      {selected ? (
        <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-card-foreground text-sm">
                {selected.label}
              </h2>
              <StatusChip status={selected.row.status} />
            </div>
            <Button
              type="button"
              variant="outline"
              // A published row refuses an edit server-side, so the button that
              // would earn the 409 is disabled rather than left to produce one.
              // `isContentEditable` is the same predicate the server applies.
              disabled={!isContentEditable(selected.row.status)}
              onClick={() =>
                openDialog({ kind: "edit", resource: selected.resource })
              }
            >
              Edit
            </Button>
          </div>

          {isContentEditable(selected.row.status) ? null : (
            <p className="text-muted-foreground text-xs">
              Published content cannot be edited. Withdraw it to draft first —
              that removes it from students immediately, and the rewrite comes
              back through review.
            </p>
          )}

          <TransitionButtons
            status={selected.row.status}
            isBusy={isBusy}
            onTransition={(hops) =>
              void handleTransition(selected.resource, selected.row.id, hops)
            }
          />

          {selectedLesson ? (
            <LessonPartLinks
              lesson={selectedLesson}
              isBusy={isBusy}
              onCreateQuiz={() => void createQuizFor(selectedLesson)}
              onQuizGenerated={(message) => {
                void load();
                setError(undefined);
                setNotice(message);
              }}
              onQuizError={(message) => {
                setNotice(undefined);
                setError(message);
              }}
            />
          ) : null}

          <p className="text-muted-foreground text-xs">
            Last changed by {selected.row.updatedBy ?? "a seed"} on{" "}
            {new Date(selected.row.updatedAt).toLocaleDateString("en-GB")}.
          </p>
        </section>
      ) : null}

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
                  {dialog.kind === "create" ? "New" : "Edit"}{" "}
                  {singular(dialog.resource)}
                </DialogTitle>
                <DialogDescription>
                  {dialog.kind === "create"
                    ? "Saved as a draft. Nothing is visible to children until it is published."
                    : "Status and position are changed outside this form."}
                </DialogDescription>
              </DialogHeader>

              {dialog.resource === "lessons" ? (
                <LessonForm
                  existing={
                    dialog.kind === "edit"
                      ? lessons.find((one) => one.id === selectedLessonId)
                      : undefined
                  }
                  topicId={selectedTopicId}
                  worlds={worlds}
                  isBusy={isBusy}
                  error={error}
                  onCancel={() => setDialog({ kind: "closed" })}
                  onSubmit={(draft) =>
                    void submit(dialog, draft, selectedLessonId)
                  }
                />
              ) : (
                <ContentForm
                  resource={dialog.resource}
                  existing={
                    dialog.kind === "edit"
                      ? findRow(dialog.resource, {
                          worlds,
                          subjects,
                          topics,
                          id: selected?.row.id,
                        })
                      : undefined
                  }
                  subjectId={selectedSubjectId}
                  isBusy={isBusy}
                  error={error}
                  onCancel={() => setDialog({ kind: "closed" })}
                  onSubmit={(draft) =>
                    void submit(dialog, draft, selected?.row.id)
                  }
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* File 34 — the AI Lesson Generator (FR-AI-01). Everything it creates is a
          draft in the review queue, which is why success here is a notice and a
          reload rather than a jump into an editor. */}
      <GenerateLessonDialog
        // Keyed on the selection so the dialog opens on whatever is in view.
        // Its subject and topic are initial state, and an unkeyed instance would
        // keep the first pair it was mounted with for the rest of the session.
        key={`${selectedSubjectId ?? ""}:${selectedTopicId ?? ""}`}
        isOpen={isGenerateOpen}
        onOpenChange={setIsGenerateOpen}
        subjects={subjects}
        topics={topics}
        worlds={worlds}
        subjectId={selectedSubjectId}
        topicId={selectedTopicId}
        onGenerated={(message) => {
          void load();
          setNotice(message);
        }}
      />
    </div>
  );

  /**
   * Creates an empty quiz and points the lesson at it, in that order.
   *
   * Two requests because they are two resources: a quiz exists in its own right and
   * publishes on its own schedule, and `Lesson.quizId` is the pointer. Doing it here
   * rather than making the admin create a quiz and paste its id is the difference
   * between a workflow and a scavenger hunt — but the id is still shown on the
   * lesson form, because an existing quiz can be shared by two lessons.
   */
  async function createQuizFor(lesson: AdminLesson) {
    setIsBusy(true);
    clearMessages();

    const created = await createQuiz(lesson.title);
    if (!created.ok) {
      setError(created.error.message);
      setIsBusy(false);
      return;
    }

    const linked = await updateContent("lessons", lesson.id, {
      quizId: created.data.id,
    });
    if (!linked.ok) {
      // The quiz exists and is reachable from the quizzes list; only the pointer
      // failed. Saying so is more useful than "that did not work", because the
      // recovery is to paste the id rather than to start again.
      setError(
        `The quiz was created but could not be linked: ${linked.error.message}`,
      );
      setIsBusy(false);
      return;
    }

    await load();
    setNotice("Quiz created and linked. Add its questions next.");
    setIsBusy(false);
  }

  async function submit(
    state: DialogState,
    draft: ContentDraft,
    id: string | undefined,
  ) {
    if (state.kind === "closed") return;

    const succeeded =
      state.kind === "create"
        ? await run(
            () => createContent(state.resource, draft),
            `Created as a draft.`,
          )
        : id === undefined
          ? false
          : await run(() => updateContent(state.resource, id, draft), "Saved.");

    if (succeeded) setDialog({ kind: "closed" });
  }
}

type SelectedRow = {
  resource: ContentResourceName;
  label: string;
  row: {
    id: string;
    status: ContentStatusValue;
    updatedBy: string | null;
    updatedAt: string;
  };
};

/**
 * Which single row the detail panel is about.
 *
 * Deepest selection wins — a chosen lesson is what an admin is looking at, not
 * the topic above it — and a world, being outside the hierarchy, is checked
 * first because selecting one clears the lesson.
 */
function useSelection(input: {
  worlds: AdminWorld[];
  subjects: AdminSubject[];
  topics: AdminTopic[];
  lessons: AdminLesson[];
  selectedWorldId?: string;
  selectedSubjectId?: string;
  selectedTopicId?: string;
  selectedLessonId?: string;
}): SelectedRow | undefined {
  return useMemo(() => {
    const world = input.worlds.find((one) => one.id === input.selectedWorldId);
    if (world) return { resource: "worlds", label: world.name, row: world };

    const lesson = input.lessons.find(
      (one) => one.id === input.selectedLessonId,
    );
    if (lesson)
      return { resource: "lessons", label: lesson.title, row: lesson };

    const topic = input.topics.find((one) => one.id === input.selectedTopicId);
    if (topic) return { resource: "topics", label: topic.name, row: topic };

    const subject = input.subjects.find(
      (one) => one.id === input.selectedSubjectId,
    );
    if (subject)
      return { resource: "subjects", label: subject.name, row: subject };

    return undefined;
  }, [input]);
}

/**
 * The three things an admin does with a selected lesson that are not edits to the
 * lesson row: preview it, and open the quiz and activity it points at.
 *
 * **Preview opens in a new tab**, because it is the real student player at full
 * bleed and losing the CMS tree behind it is how a reviewer loses their place. It
 * is offered whatever the lesson's status — that is the point of it (FR-CMS-04).
 */
function LessonPartLinks({
  lesson,
  isBusy,
  onCreateQuiz,
  onQuizGenerated,
  onQuizError,
}: {
  lesson: AdminLesson;
  isBusy: boolean;
  onCreateQuiz: () => void;
  onQuizGenerated: (message: string) => void;
  onQuizError: (message: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline">
        <Link
          href={`/lesson/${lesson.id}?preview=1`}
          target="_blank"
          rel="noreferrer"
        >
          Preview
        </Link>
      </Button>

      {lesson.quizId ? (
        <Button asChild variant="outline">
          <Link href={`${ADMIN_ROUTES.curriculum}/quiz/${lesson.quizId}`}>
            Edit quiz
          </Link>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={isBusy}
          onClick={onCreateQuiz}
        >
          Create quiz
        </Button>
      )}

      {/* File 35 — the AI Quiz Generator (FR-AI-03). It creates the quiz itself
          when the lesson has none, so it does not wait on "Create quiz". */}
      <GenerateQuizButton
        lessonId={lesson.id}
        isBusy={isBusy}
        onGenerated={onQuizGenerated}
        onError={onQuizError}
      />

      {lesson.activityId ? (
        <Button asChild variant="outline">
          <Link
            href={`${ADMIN_ROUTES.curriculum}/activity/${lesson.activityId}`}
          >
            Edit activity
          </Link>
        </Button>
      ) : (
        <Button asChild variant="outline">
          <Link href={`${ADMIN_ROUTES.curriculum}/activity/new`}>
            New activity
          </Link>
        </Button>
      )}
    </div>
  );
}

function toColumnItem(row: {
  id: string;
  name: string;
  status: ContentStatusValue;
}): ColumnItem {
  return { id: row.id, label: row.name, status: row.status };
}

/** Reorders a flat list to match `orderedIds`, for the optimistic update. */
function reorderLocally<TRow extends { id: string }>(
  rows: TRow[],
  orderedIds: string[],
): TRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return orderedIds
    .map((id) => byId.get(id))
    .filter((row): row is TRow => row !== undefined);
}

/**
 * The same, for a list holding several parents' children: only the rows named in
 * `orderedIds` move, and they take the positions those rows already occupied.
 */
function reorderWithinParent<TRow extends { id: string }>(
  rows: TRow[],
  orderedIds: string[],
): TRow[] {
  const moved = reorderLocally(rows, orderedIds);
  let next = 0;
  return rows.map((row) => (orderedIds.includes(row.id) ? moved[next++] : row));
}

function findRow(
  resource: ContentResourceName,
  input: {
    worlds: AdminWorld[];
    subjects: AdminSubject[];
    topics: AdminTopic[];
    id?: string;
  },
): AdminWorld | AdminSubject | AdminTopic | undefined {
  if (input.id === undefined) return undefined;
  if (resource === "worlds")
    return input.worlds.find((one) => one.id === input.id);
  if (resource === "subjects")
    return input.subjects.find((one) => one.id === input.id);
  if (resource === "topics")
    return input.topics.find((one) => one.id === input.id);
  return undefined;
}

function singular(resource: ContentResourceName): string {
  return resource.slice(0, -1);
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="font-semibold text-foreground text-xl">Curriculum</h1>
      <p className="text-muted-foreground text-sm">
        The curriculum could not be loaded.
      </p>
      <Button type="button" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
