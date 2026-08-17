"use client";

import type {
  StoryCompletionResponse,
  StoryDetailResponse,
} from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { ArrowLeft, ArrowRight, BookOpen, Home, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { StudentStatus } from "@/app/(student)/StudentGuard";
import { useAudio } from "@/components/AudioProvider";
import { getStory } from "@/lib/content-api";
import { STUDENT_NAMESPACE } from "@/lib/i18n";
import { completeStory } from "@/lib/progress-api";
import { FinishScreen } from "./FinishScreen";
import {
  initialReaderState,
  type ReaderEvent,
  readerReducer,
} from "./reader-machine";
import { StoryPageView } from "./StoryPageView";

/**
 * The story reader (FR-STORY-02..03, FR-STORY-06..07).
 *
 * **The flow's rules are in `reader-machine.ts`; every effect is here** — the same
 * split `LessonPlayer` uses. The reducer says which page is on screen; this file
 * plays that page's narration, holds the auto-advance timer, listens for a swipe
 * and posts the completion.
 *
 * **Narration follows the page, not the tap.** One effect keyed on the page starts
 * its clip and cancels the pending advance on the way out, so a child who turns
 * three pages quickly hears only the third — there is one audio channel
 * (`AudioProvider`), and voices talking over each other are worse than silence for
 * the child this is built for.
 *
 * **The completion is asked for once per mount, however many times the story is
 * read.** `completionRequested` is set the first time the story ends and never
 * resets across "Read again", so the tenth reading of a favourite makes no request
 * at all. The server would refuse to pay twice anyway (FR-STORY-06); this keeps
 * the reader from asking a question whose answer it already has.
 *
 * The fetch and the reading surface are split so the reducer can be initialised
 * with the real page count instead of being told it afterwards — a reader whose
 * state has to be corrected after the first paint is a reader that can be paged
 * past the end of a story in the frame before the correction lands.
 */

/** Held after the narration ends before the page turns itself. */
const AUTO_ADVANCE_HOLD_MS = 1500;

/** How far a finger travels before it counts as a page turn rather than a tap. */
const SWIPE_THRESHOLD_PX = 50;

/** How often the follow-along highlight re-reads its position. */
const HIGHLIGHT_TICK_MS = 100;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; story: StoryDetailResponse }
  | { status: "gone" }
  | { status: "error" };

export function StoryReader({ storyId }: { storyId: string }) {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [isWakingUp, setIsWakingUp] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    void getStory(storyId, {
      onColdStart: () => {
        if (isCurrent) setIsWakingUp(true);
      },
    }).then((result) => {
      if (!isCurrent) return;
      setIsWakingUp(false);
      if (!result.ok) {
        // A story unpublished while the child was on the library screen is a
        // `404` — a book that was put away, not a failure to apologise for.
        setLoad({
          status: result.error.code === "NOT_FOUND" ? "gone" : "error",
        });
        return;
      }
      setLoad({ status: "ready", story: result.data.story });
    });

    return () => {
      isCurrent = false;
    };
  }, [storyId]);

  if (load.status === "loading") {
    return (
      <StudentStatus tone="status">
        {isWakingUp ? t("status.waking") : t("selectProfile.loading")}
      </StudentStatus>
    );
  }
  if (load.status === "gone") {
    return <StudentStatus tone="status">{t("reader.notFound")}</StudentStatus>;
  }
  if (load.status === "error") {
    return <StudentStatus tone="alert">{t("status.error")}</StudentStatus>;
  }
  if (load.story.pages.length === 0) {
    // A published story whose pages were all removed. Not an error screen —
    // there is nothing wrong, and nothing for a child to fix.
    return <StudentStatus tone="status">{t("reader.empty")}</StudentStatus>;
  }

  return <ReadingSurface story={load.story} />;
}

function ReadingSurface({ story }: { story: StoryDetailResponse }) {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const { play, stop } = useAudio();
  const [state, dispatch] = useReducer(
    readerReducer,
    story.pages.length,
    initialReaderState,
  );
  const [completion, setCompletion] = useState<
    StoryCompletionResponse | undefined
  >(undefined);
  const [elapsedMs, setElapsedMs] = useState(0);

  const page = story.pages[state.pageIndex];
  const narrationUrl = page?.narrationUrl ?? null;
  const isReading = state.phase === "reading";
  const isLastPage = state.pageIndex === story.pages.length - 1;

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const cancelPendingAdvance = useCallback(() => {
    if (advanceTimer.current !== undefined) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = undefined;
    }
  }, []);

  /**
   * Every dispatch a control makes goes through here, so a pending advance is
   * cancelled by construction. A tap always beats the timer: the child asked for
   * this page, and a book that turns itself under their finger is one they
   * cannot steer.
   */
  const act = useCallback(
    (event: ReaderEvent) => {
      cancelPendingAdvance();
      dispatch(event);
    },
    [cancelPendingAdvance],
  );

  // Narration follows the page. The cleanup is what makes a fast run of taps
  // leave one voice playing rather than five.
  useEffect(() => {
    if (!isReading || narrationUrl === null) return;

    setElapsedMs(0);
    void play(narrationUrl, {
      interrupt: true,
      onFinished: () => {
        advanceTimer.current = setTimeout(() => {
          advanceTimer.current = undefined;
          dispatch({ type: "NARRATION_ENDED" });
        }, AUTO_ADVANCE_HOLD_MS);
      },
    });

    return cancelPendingAdvance;
  }, [play, narrationUrl, isReading, cancelPendingAdvance]);

  // Stop the voice on the way out. `AudioProvider` does this on its own unmount
  // too, but a child usually leaves the reader without leaving the app.
  useEffect(() => stop, [stop]);

  /**
   * Where the narration has got to, for the follow-along highlight.
   *
   * Runs only for a page that actually carries timings — none of them, until the
   * voice pipeline (file 36) produces some — so the ordinary reading path has no
   * interval at all. It counts from when playback started rather than reading the
   * element's `currentTime`, which the shared audio channel does not expose; the
   * drift across one page of narration is well under what a word-level highlight
   * would show, and swapping in the real clock later is a change to this effect
   * and nothing else.
   */
  const hasTimings = page?.narrationTimings != null;
  useEffect(() => {
    if (!isReading || !hasTimings) return;
    const startedAt = performance.now();
    const tick = setInterval(
      () => setElapsedMs(performance.now() - startedAt),
      HIGHLIGHT_TICK_MS,
    );
    return () => clearInterval(tick);
  }, [isReading, hasTimings]);

  const storyId = story.id;
  const hasRequestedCompletion = useRef(false);
  useEffect(() => {
    if (!state.completionRequested || hasRequestedCompletion.current) return;
    hasRequestedCompletion.current = true;

    // File 27 adds the `story_start` / `story_complete` SessionEvents and the
    // screen-time heartbeat around this call. Nothing is reported from here yet:
    // the events endpoint accepts only the three lesson-flow types today, so a
    // story event posted now would be a 400 on a screen a child is looking at.

    void completeStory(storyId).then((result) => {
      if (!result.ok) {
        // Logged for an adult, invisible to the child. The story was finished
        // whether or not the network agreed.
        console.warn(
          `[kidlearn] story ${storyId} completion not recorded: ${result.error.code}`,
        );
        return;
      }
      setCompletion(result.data);
    });
  }, [state.completionRequested, storyId]);

  const swipeStartX = useRef<number | undefined>(undefined);

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const startX = swipeStartX.current;
    swipeStartX.current = undefined;
    if (startX === undefined) return;

    const deltaX = event.clientX - startX;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
    // Dragging the page leftwards pulls the next one in, as a paper book does.
    act({ type: deltaX < 0 ? "NEXT" : "BACK" });
  };

  const backToLibrary = () => {
    stop();
    router.push("/stories");
  };

  if (state.phase === "finished") {
    return (
      <FinishScreen
        moral={story.moral}
        moralAudioUrl={story.moralAudioUrl}
        completion={completion}
        onReadAgain={() => act({ type: "READ_AGAIN" })}
        onMoreStories={backToLibrary}
      />
    );
  }

  return (
    // Edge to edge with the safe-area insets the lesson player uses: the reader is
    // a full-screen surface of its own, and a page of a story must clear a notch
    // (design.md §6).
    <div
      data-testid="story-reader"
      className="relative flex min-h-dvh flex-1 flex-col bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
      onPointerDown={(event) => {
        swipeStartX.current = event.clientX;
      }}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeStartX.current = undefined;
      }}
    >
      <header className="flex items-start justify-between gap-4 p-4">
        <IconControl label={t("reader.exit")} onPress={backToLibrary}>
          <Home aria-hidden="true" className="size-8" />
        </IconControl>

        {/* Where the child is in the book. `polite`, so it is read after the
            page's own text rather than over it. */}
        <p
          role="status"
          aria-live="polite"
          className="pt-4 font-display text-lg text-muted-foreground"
        >
          {t("reader.page", {
            current: state.pageIndex + 1,
            total: story.pages.length,
          })}
        </p>

        <IconControl
          label={t(
            state.autoAdvance
              ? "reader.autoAdvanceOn"
              : "reader.autoAdvanceOff",
          )}
          isPressed={state.autoAdvance}
          onPress={() => act({ type: "TOGGLE_AUTO_ADVANCE" })}
        >
          <BookOpen aria-hidden="true" className="size-8" />
        </IconControl>
      </header>

      <main className="flex flex-1 flex-col px-6 pb-4">
        {page === undefined ? null : (
          <StoryPageView page={page} elapsedMs={elapsedMs} />
        )}
      </main>

      {/* The three controls sit along the bottom, in the thumb zone: back and
          next in the corners a hand already rests on, "hear it again" between
          them where neither is hit by accident (design.md §6). */}
      <nav className="flex items-center justify-between gap-4 px-6 pb-6">
        {state.pageIndex === 0 ? (
          // A spacer, not a disabled button: page one has nothing before it, and
          // a greyed-out arrow is a thing to keep tapping.
          <span aria-hidden="true" className="size-16" />
        ) : (
          <IconControl
            label={t("reader.previous")}
            tone="primary"
            onPress={() => act({ type: "BACK" })}
          >
            <ArrowLeft aria-hidden="true" className="size-9" />
          </IconControl>
        )}

        {narrationUrl === null ? (
          <span aria-hidden="true" className="size-16" />
        ) : (
          <IconControl
            label={t("reader.replay")}
            onPress={() => {
              // Not `act`: hearing the page again is not leaving it, so the
              // pending advance is cancelled and then re-armed by the clip's own
              // `onFinished` rather than being dropped.
              cancelPendingAdvance();
              setElapsedMs(0);
              void play(narrationUrl, {
                interrupt: true,
                onFinished: () => {
                  advanceTimer.current = setTimeout(() => {
                    advanceTimer.current = undefined;
                    dispatch({ type: "NARRATION_ENDED" });
                  }, AUTO_ADVANCE_HOLD_MS);
                },
              });
            }}
          >
            <Volume2 aria-hidden="true" className="size-8" />
          </IconControl>
        )}

        <IconControl
          label={t(isLastPage ? "reader.finishStory" : "reader.next")}
          tone="primary"
          onPress={() => act({ type: "NEXT" })}
        >
          <ArrowRight aria-hidden="true" className="size-9" />
        </IconControl>
      </nav>
    </div>
  );
}

/**
 * A round 64px control — the kid touch-target floor (design.md §7, NFR-A11Y-02).
 *
 * An icon and a label, never an icon alone: the picture is what a pre-reader
 * navigates by, and the label is the whole control for a screen reader.
 */
const iconControlVariants = cva(
  "inline-flex size-16 shrink-0 items-center justify-center rounded-pill transition-colors [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      tone: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      },
    },
    defaultVariants: { tone: "secondary" },
  },
);

function IconControl({
  label,
  tone,
  isPressed,
  onPress,
  children,
}: {
  label: string;
  tone?: "primary" | "secondary";
  /** Sets `aria-pressed`; omitted for controls that are not toggles. */
  isPressed?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isPressed}
      className={cn(iconControlVariants({ tone }))}
      onClick={onPress}
    >
      {children}
    </button>
  );
}
