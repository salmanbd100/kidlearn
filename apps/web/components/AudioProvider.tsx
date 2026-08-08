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

/**
 * One narration channel for the whole app (NFR-A11Y-01 groundwork).
 *
 * A 3-year-old taps everything. Without a single channel, three overlapping
 * voice-overs play at once and none of them is understandable — so starting a
 * clip stops whatever was playing, and there is never more than one live
 * `HTMLAudioElement`.
 *
 * The real narration assets arrive with the AI pipeline (file 36); this is the
 * playback machinery they will use.
 */

const MUTE_STORAGE_KEY = "kidlearn_audio_muted";

export interface AudioChannel {
  /** Resolves once playback has started (or was skipped). Never rejects. */
  play: (url: string, opts?: { interrupt?: boolean }) => Promise<void>;
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

  // Read after mount, not during render: the server has no localStorage, so
  // seeding state from it directly would break hydration.
  useEffect(() => {
    setMutedState(window.localStorage.getItem(MUTE_STORAGE_KEY) === "true");
  }, []);

  const stop = useCallback(() => {
    const current = currentRef.current;
    if (current !== undefined) {
      current.pause();
      current.currentTime = 0;
      currentRef.current = undefined;
    }
    setIsPlaying(false);
  }, []);

  const setMuted = useCallback(
    (nextMuted: boolean) => {
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
    async (url: string, opts?: { interrupt?: boolean }) => {
      if (muted) return;

      const shouldInterrupt = opts?.interrupt ?? true;
      if (!shouldInterrupt && currentRef.current !== undefined) return;

      stop();

      const element = new Audio(url);
      currentRef.current = element;

      const handleEnded = () => {
        if (currentRef.current === element) {
          currentRef.current = undefined;
          setIsPlaying(false);
        }
      };
      element.addEventListener("ended", handleEnded, { once: true });
      element.addEventListener("error", handleEnded, { once: true });

      try {
        await element.play();
        // A newer clip may have replaced this one while `play()` was pending.
        if (currentRef.current === element) setIsPlaying(true);
      } catch {
        // Autoplay policies reject before any user gesture. A missing voice-over
        // must never break the screen — every prompt also has text and an icon.
        handleEnded();
      }
    },
    [muted, stop],
  );

  // Leaving a clip playing after the tree unmounts is how narration follows a
  // child into the next screen.
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
