"use client";

import { STUDENT_NAMESPACE } from "@kidlearn/i18n";
import type {
  ScreenTimeBlockCode,
  StoryCompletionResponse,
  StoryDetailResponse,
} from "@kidlearn/types";
import { ArrowLeft, ArrowRight, BookOpen, Home, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { getStory } from "@/features/content/content-api";
import { ScreenTimeLock } from "@/features/screen-time/ScreenTimeLock";
import {
  isScreenTimeBlock,
  windowStartFromError,
} from "@/features/screen-time/screen-time-api";
import { trackEvent, useHeartbeat } from "@/features/screen-time/use-heartbeat";
import { completeStory } from "@/shared/api/progress-api";
import { useAudio } from "@/shared/components/AudioProvider";
import { IconControl } from "@/shared/components/kid/IconControl";
import { Retryable } from "@/shared/components/kid/Retryable";
import { StudentStatus } from "@/shared/components/kid/StudentStatus";
import { useFocusWhenDropped } from "@/shared/hooks/use-focus-when-dropped";
import { FinishScreen, type StoryFinishReward } from "./FinishScreen";
import { activeSpanIndex } from "./NarratedText";
import {
  initialReaderState,
  type ReaderEvent,
  readerReducer,
} from "./reader-machine";
import { StoryPageView } from "./StoryPageView";

const AUTO_ADVANCE_HOLD_MS = 1500;

/** How far a finger travels before it counts as a page turn rather than a tap. */
const SWIPE_THRESHOLD_PX = 50;

/** How often the follow-along highlight re-reads its position. */
const HIGHLIGHT_TICK_MS = 100;

/** What the server would answer for any reading after the first. Written here because the reader posts the completion once per mount. */
const REPLAY_COMPLETION: StoryFinishReward = {
  granted: null,
  // A re-read inside one mount unlocks nothing new — the badge and character
  // evaluation ran on the reading that has already been posted.
  newBadges: [],
  newCharacters: [],
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; story: StoryDetailResponse }
  | { status: "gone" }
  /** The screen-time gate refused this start. Only opening a story can land here; every page arrives in one response. */
  | {
      status: "blocked";
      reason: ScreenTimeBlockCode;
      windowStart: string | null;
    }
  | { status: "error" };

export function StoryReader({ storyId }: { storyId: string }) {
  return (
    <Retryable>
      {(retry) => <StoryLoader storyId={storyId} onRetry={retry} />}
    </Retryable>
  );
}

function StoryLoader({
  storyId,
  onRetry,
}: {
  storyId: string;
  onRetry: () => void;
}) {
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
        if (isScreenTimeBlock(result.error)) {
          setLoad({
            status: "blocked",
            reason: result.error.code,
            windowStart: windowStartFromError(result.error) ?? null,
          });
          return;
        }
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
  if (load.status === "blocked") {
    return (
      <ScreenTimeLock reason={load.reason} windowStart={load.windowStart} />
    );
  }
  if (load.status === "error") {
    return (
      <StudentStatus tone="alert" onRetry={onRetry}>
        {t("status.error")}
      </StudentStatus>
    );
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
  // Mounted here so beats start only when a story is on screen; the loading and "put away" states are not reading time.
  // Nothing renders the returned total; it is the session's own figure.
  useHeartbeat();
  const [state, dispatch] = useReducer(
    readerReducer,
    story.pages.length,
    initialReaderState,
  );
  const [completion, setCompletion] = useState<
    StoryCompletionResponse | undefined
  >(undefined);
  const [elapsedMs, setElapsedMs] = useState(0);
  /** When the clip now on screen started; state, not the effect's closure, so every page turn and replay restarts the follow-along clock. */
  const [narrationStartedAt, setNarrationStartedAt] = useState(0);
  /** Set when the child asks for the story again, never cleared: the grant `completion` holds belongs to the reading that earned it, and it outranks a reply landing after the replay began. */
  const [isReplay, setIsReplay] = useState(false);

  const storyId = story.id;
  const page = story.pages[state.pageIndex];
  const pageRef = useFocusWhenDropped<HTMLElement>(state.pageIndex);
  const narrationUrl = page?.narrationUrl ?? null;
  const isReading = state.phase === "reading";
  const isLastPage = state.pageIndex === story.pages.length - 1;

  // The reading began. Once per mount, like `lesson_start`: "Read again" is the same sitting continuing.
  useEffect(() => {
    trackEvent("story_start", storyId);
  }, [storyId]);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const cancelPendingAdvance = useCallback(() => {
    if (advanceTimer.current !== undefined) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = undefined;
    }
  }, []);

  /** Every control dispatch goes through here so a pending advance is cancelled by construction: a tap always beats the timer. */
  const act = useCallback(
    (event: ReaderEvent) => {
      cancelPendingAdvance();
      dispatch(event);
    },
    [cancelPendingAdvance],
  );

  /** Starts a clip and re-arms the hold that turns the page. Shared by the page effect and the speaker button so both move the highlight clock. */
  const playNarration = useCallback(
    (url: string) => {
      setElapsedMs(0);
      setNarrationStartedAt(performance.now());
      void play(url, {
        interrupt: true,
        onFinished: (outcome) => {
          // A clip nobody heard — muted, blocked, failed to load — must not turn
          // the page: the child would be flipped past text they have not read.
          if (outcome !== "ended") return;
          cancelPendingAdvance();
          advanceTimer.current = setTimeout(() => {
            advanceTimer.current = undefined;
            dispatch({ type: "NARRATION_ENDED" });
          }, AUTO_ADVANCE_HOLD_MS);
        },
      });
    },
    [play, cancelPendingAdvance],
  );

  // Narration follows the page, keyed on the page not its url, so a reused recording still restarts. The cleanup leaves one voice
  // playing after fast taps and silences the last page on the way to the ending.
  useEffect(() => {
    if (!isReading || page === undefined || page.narrationUrl === null) return;

    playNarration(page.narrationUrl);

    return () => {
      cancelPendingAdvance();
      stop();
    };
  }, [page, isReading, playNarration, cancelPendingAdvance, stop]);

  // Stop the voice on the way out. `AudioProvider` does this on its own unmount
  // too, but a child usually leaves the reader without leaving the app.
  useEffect(() => stop, [stop]);

  /** Where the narration has got to, for the follow-along highlight. */
  const narrationTimings = page?.narrationTimings ?? null;
  useEffect(() => {
    if (!isReading || narrationTimings === null) return;
    // Sampled often so the highlight lands on the word, but state is only set
    // when the active word changes: setting it every tick re-rendered the whole
    // reader (picture, header, controls) ten times a second on a low-end tablet.
    let lastActive = Number.NaN;
    const tick = setInterval(() => {
      const elapsed = performance.now() - narrationStartedAt;
      const active = activeSpanIndex(narrationTimings, elapsed);
      if (active === lastActive) return;
      lastActive = active;
      setElapsedMs(elapsed);
    }, HIGHLIGHT_TICK_MS);
    return () => clearInterval(tick);
  }, [isReading, narrationTimings, narrationStartedAt]);

  const hasRequestedCompletion = useRef(false);
  useEffect(() => {
    if (!state.completionRequested || hasRequestedCompletion.current) return;
    hasRequestedCompletion.current = true;

    trackEvent("story_complete", storyId);

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
        completion={isReplay ? REPLAY_COMPLETION : completion}
        onReadAgain={() => {
          setIsReplay(true);
          act({ type: "READ_AGAIN" });
        }}
        onMoreStories={backToLibrary}
      />
    );
  }

  return (
    // The student layout supplies the viewport height and the safe-area insets;
    // the reader fills what is left of it.
    <div
      data-testid="story-reader"
      className="relative flex flex-1 flex-col bg-background"
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

        {/* `polite`, so it is read after the page's own text rather than over it. */}
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

      <main
        ref={pageRef}
        // Where focus lands when the control the child used leaves with the
        // page — the back arrow, on returning to page one.
        tabIndex={-1}
        className="flex flex-1 flex-col px-6 pb-4 outline-none"
      >
        {page === undefined ? null : (
          <StoryPageView page={page} elapsedMs={elapsedMs} />
        )}
      </main>

      {/* The three controls sit in the thumb zone: back and next in the corners a hand rests on, "hear it again" between them (design.md §6). */}
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
              playNarration(narrationUrl);
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
