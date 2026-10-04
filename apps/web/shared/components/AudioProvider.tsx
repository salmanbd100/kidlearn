"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// One narration channel for the whole app (NFR-A11Y-01 groundwork).

const MUTE_STORAGE_KEY = "kidlearn_audio_muted";

/**
 * `ended` — the child heard the whole clip. `unplayed` — it was never heard to
 * the end: it failed to load, was blocked by autoplay policy, or was refused
 * because the channel is muted or already busy.
 */
export type PlayOutcome = "ended" | "unplayed";

export interface PlayOptions {
  interrupt?: boolean;
  /**
   * Called once when this clip is no longer going to be heard. Not called when
   * the clip is cut off by `stop()` or replaced by a newer one — whoever did
   * that has moved on and must not be told the old clip finished.
   */
  onFinished?: (outcome: PlayOutcome) => void;
}

export interface AudioChannel {
  /** Resolves once playback has started (or was skipped). Never rejects. */
  play: (url: string, opts?: PlayOptions) => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

const AudioChannelContext = createContext<AudioChannel | undefined>(undefined);

export function AudioProvider({ children }: { children: ReactNode }) {
  const currentRef = useRef<HTMLAudioElement | undefined>(undefined);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMutedState] = useState(false);
  // `play` reads this rather than `muted`: with `muted` in its dependencies,
  // toggling mute changed `play`'s identity, which re-ran every effect keyed on
  // it — replaying a screen's narration and restarting the reward timers.
  const mutedRef = useRef(false);

  const stop = useCallback(() => {
    const current = currentRef.current;
    if (current !== undefined) {
      current.pause();
      current.currentTime = 0;
      currentRef.current = undefined;
    }
    setIsPlaying(false);
  }, []);

  // Read after mount, not during render: the server has no localStorage, so
  // seeding state from it directly would break hydration. Child effects run
  // before this one, so the first screen's narration may already be playing by
  // the time the stored preference is known — silence it.
  useEffect(() => {
    let isStoredMuted = false;
    try {
      isStoredMuted = window.localStorage.getItem(MUTE_STORAGE_KEY) === "true";
    } catch {
      // Blocked storage (locked-down WebViews, kiosk profiles) must not take
      // the root layout down — default to unmuted.
    }
    mutedRef.current = isStoredMuted;
    setMutedState(isStoredMuted);
    if (isStoredMuted) stop();
  }, [stop]);

  const setMuted = useCallback(
    (nextMuted: boolean) => {
      mutedRef.current = nextMuted;
      setMutedState(nextMuted);
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, String(nextMuted));
      } catch {
        // Quota or private-browsing failure — the session still respects it.
      }
      if (nextMuted) stop();
    },
    [stop],
  );

  const play = useCallback(
    async (url: string, opts?: PlayOptions) => {
      if (mutedRef.current) {
        opts?.onFinished?.("unplayed");
        return;
      }

      const shouldInterrupt = opts?.interrupt ?? true;
      if (!shouldInterrupt && currentRef.current !== undefined) {
        opts?.onFinished?.("unplayed");
        return;
      }

      stop();

      const element = new Audio(url);
      currentRef.current = element;

      let hasFinished = false;
      const finish = (outcome: PlayOutcome) => {
        // `stop()` or a newer clip took the channel: `pause()` rejects a pending
        // `play()` with `AbortError`, which lands here. Reporting it would let a
        // caller act on a clip it already cancelled.
        const isSuperseded = currentRef.current !== element;
        if (!isSuperseded) {
          currentRef.current = undefined;
          setIsPlaying(false);
        }
        // `ended` and `error` are both registered `once`, but a clip that fails
        // after starting can fire the second while the first has already run.
        if (hasFinished) return;
        hasFinished = true;
        if (!isSuperseded) opts?.onFinished?.(outcome);
      };
      element.addEventListener("ended", () => finish("ended"), { once: true });
      element.addEventListener("error", () => finish("unplayed"), {
        once: true,
      });

      try {
        await element.play();
        // A newer clip may have replaced this one while `play()` was pending.
        if (currentRef.current === element) setIsPlaying(true);
      } catch {
        // Autoplay policies reject before any user gesture. A missing voice-over
        // must never break the screen — every prompt also has text and an icon.
        finish("unplayed");
      }
    },
    [stop],
  );

  // Stop on unmount. An `HTMLAudioElement` is not part of the React tree, so a
  // clip left playing would follow the child into the next screen and talk over
  // whatever it says.
  useEffect(() => stop, [stop]);

  const channel = useMemo<AudioChannel>(
    () => ({ play, stop, isPlaying, muted, setMuted }),
    [play, stop, isPlaying, muted, setMuted],
  );

  return (
    <AudioChannelContext.Provider value={channel}>
      {children}
    </AudioChannelContext.Provider>
  );
}

export function useAudio(): AudioChannel {
  const channel = useContext(AudioChannelContext);
  if (channel === undefined) {
    throw new Error("useAudio must be used inside an <AudioProvider>.");
  }
  return channel;
}
