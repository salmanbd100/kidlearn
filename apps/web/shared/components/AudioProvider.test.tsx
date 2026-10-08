import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioProvider, type PlayOptions, useAudio } from "./AudioProvider";

class MockAudio {
  static instances: MockAudio[] = [];

  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  currentTime = 0;
  listeners: Record<string, () => void> = {};
  addEventListener = vi.fn((type: string, listener: () => void) => {
    this.listeners[type] = listener;
  });
  removeEventListener = vi.fn();

  constructor(public readonly src: string) {
    MockAudio.instances.push(this);
  }
}

function AudioHarness() {
  const { play, stop, isPlaying, muted, setMuted } = useAudio();
  return (
    <div>
      <button type="button" onClick={() => void play("/audio/one.mp3")}>
        one
      </button>
      <button type="button" onClick={() => void play("/audio/two.mp3")}>
        two
      </button>
      <button
        type="button"
        onClick={() => void play("/audio/polite.mp3", { interrupt: false })}
      >
        polite
      </button>
      <button type="button" onClick={stop}>
        stop
      </button>
      <button type="button" onClick={() => setMuted(!muted)}>
        toggle-mute
      </button>
      <output>{isPlaying ? "playing" : "silent"}</output>
    </div>
  );
}

function renderHarness() {
  return render(
    <AudioProvider>
      <AudioHarness />
    </AudioProvider>,
  );
}

describe("AudioProvider", () => {
  beforeEach(() => {
    MockAudio.instances = [];
    vi.stubGlobal("Audio", MockAudio);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops the previous clip before starting a new one", async () => {
    renderHarness();

    fireEvent.click(screen.getByText("one"));
    await waitFor(() => expect(MockAudio.instances).toHaveLength(1));

    fireEvent.click(screen.getByText("two"));
    await waitFor(() => expect(MockAudio.instances).toHaveLength(2));

    expect(MockAudio.instances[0].pause).toHaveBeenCalledOnce();
    expect(MockAudio.instances[0].currentTime).toBe(0);
    expect(MockAudio.instances[1].play).toHaveBeenCalledOnce();
    expect(MockAudio.instances[1].src).toBe("/audio/two.mp3");
  });

  it("reports playback state to consumers", async () => {
    renderHarness();
    expect(screen.getByRole("status")).toHaveTextContent("silent");

    fireEvent.click(screen.getByText("one"));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("playing"),
    );
  });

  it("keeps the current clip when a later one asks not to interrupt", async () => {
    renderHarness();

    fireEvent.click(screen.getByText("one"));
    await waitFor(() => expect(MockAudio.instances).toHaveLength(1));

    fireEvent.click(screen.getByText("polite"));

    await waitFor(() => expect(MockAudio.instances).toHaveLength(1));
    expect(MockAudio.instances[0].pause).not.toHaveBeenCalled();
  });

  it("plays nothing while muted", async () => {
    renderHarness();

    fireEvent.click(screen.getByText("toggle-mute"));
    fireEvent.click(screen.getByText("one"));

    await waitFor(() => expect(MockAudio.instances).toHaveLength(0));
  });

  it("silences the current clip the moment mute is turned on", async () => {
    renderHarness();

    fireEvent.click(screen.getByText("one"));
    await waitFor(() => expect(MockAudio.instances).toHaveLength(1));

    fireEvent.click(screen.getByText("toggle-mute"));

    expect(MockAudio.instances[0].pause).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("silent");
  });

  it("remembers the mute choice across mounts", async () => {
    const { unmount } = renderHarness();
    fireEvent.click(screen.getByText("toggle-mute"));
    unmount();

    renderHarness();
    fireEvent.click(screen.getByText("one"));

    await waitFor(() => expect(MockAudio.instances).toHaveLength(0));
  });

  it("stop() pauses the clip and clears the playing flag", async () => {
    renderHarness();

    fireEvent.click(screen.getByText("one"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("playing"),
    );

    fireEvent.click(screen.getByText("stop"));

    expect(MockAudio.instances[0].pause).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("silent");
  });

  describe("onFinished", () => {
    function ClipHarness({ options }: { options: PlayOptions }) {
      const { play, stop } = useAudio();
      return (
        <div>
          <button type="button" onClick={() => void play("/a.mp3", options)}>
            play-a
          </button>
          <button type="button" onClick={() => void play("/b.mp3")}>
            play-b
          </button>
          <button type="button" onClick={stop}>
            stop-clip
          </button>
        </div>
      );
    }

    function renderClip(options: PlayOptions) {
      return render(
        <AudioProvider>
          <ClipHarness options={options} />
        </AudioProvider>,
      );
    }

    it("reports ended when the clip plays to its end", async () => {
      const onFinished = vi.fn();
      renderClip({ onFinished });

      fireEvent.click(screen.getByText("play-a"));
      await waitFor(() => expect(MockAudio.instances).toHaveLength(1));
      MockAudio.instances[0].listeners.ended?.();

      expect(onFinished).toHaveBeenCalledExactlyOnceWith("ended");
    });

    it("reports unplayed when the clip fails to load", async () => {
      const onFinished = vi.fn();
      renderClip({ onFinished });

      fireEvent.click(screen.getByText("play-a"));
      await waitFor(() => expect(MockAudio.instances).toHaveLength(1));
      MockAudio.instances[0].listeners.error?.();

      expect(onFinished).toHaveBeenCalledExactlyOnceWith("unplayed");
    });

    it("reports unplayed when autoplay policy rejects the clip", async () => {
      const onFinished = vi.fn();
      vi.stubGlobal(
        "Audio",
        class extends MockAudio {
          play = vi.fn(() =>
            Promise.reject(new DOMException("blocked", "NotAllowedError")),
          );
        },
      );
      renderClip({ onFinished });

      fireEvent.click(screen.getByText("play-a"));

      await waitFor(() =>
        expect(onFinished).toHaveBeenCalledExactlyOnceWith("unplayed"),
      );
    });

    it("stays silent when a newer clip aborts a pending one", async () => {
      const onFinished = vi.fn();
      let rejectFirst: (reason: unknown) => void = () => {};
      let isFirst = true;
      vi.stubGlobal(
        "Audio",
        class extends MockAudio {
          play = vi.fn(() => {
            if (!isFirst) return Promise.resolve();
            isFirst = false;
            return new Promise<void>((_resolve, reject) => {
              rejectFirst = reject;
            });
          });
        },
      );
      renderClip({ onFinished });

      fireEvent.click(screen.getByText("play-a"));
      await waitFor(() => expect(MockAudio.instances).toHaveLength(1));
      fireEvent.click(screen.getByText("play-b"));
      // What `pause()` does to a `play()` still pending.
      rejectFirst(new DOMException("interrupted", "AbortError"));
      await Promise.resolve();

      expect(onFinished).not.toHaveBeenCalled();
    });

    it("stays silent when stop() cuts the clip off", async () => {
      const onFinished = vi.fn();
      renderClip({ onFinished });

      fireEvent.click(screen.getByText("play-a"));
      await waitFor(() => expect(MockAudio.instances).toHaveLength(1));
      fireEvent.click(screen.getByText("stop-clip"));
      MockAudio.instances[0].listeners.error?.();

      expect(onFinished).not.toHaveBeenCalled();
    });
  });

  it("silences a clip a child effect started before the stored mute was read", async () => {
    window.localStorage.setItem("kidlearn_audio_muted", "true");
    function PlaysOnMount() {
      const { play } = useAudio();
      useEffect(() => {
        void play("/audio/first-screen.mp3");
      }, [play]);
      return null;
    }

    render(
      <AudioProvider>
        <PlaysOnMount />
      </AudioProvider>,
    );

    await waitFor(() => expect(MockAudio.instances).toHaveLength(1));
    expect(MockAudio.instances[0].pause).toHaveBeenCalled();
  });

  it("keeps `play` stable when mute is toggled, so effects keyed on it do not re-run", () => {
    // Toggling mute used to change `play`'s identity, replaying narration and restarting timers.
    const seen: Array<(url: string) => Promise<void>> = [];
    function Capture() {
      const { play, setMuted, muted } = useAudio();
      seen.push(play);
      return (
        <button type="button" onClick={() => setMuted(!muted)}>
          toggle
        </button>
      );
    }

    render(
      <AudioProvider>
        <Capture />
      </AudioProvider>,
    );
    fireEvent.click(screen.getByText("toggle"));
    fireEvent.click(screen.getByText("toggle"));

    expect(new Set(seen).size).toBe(1);
  });

  it("still plays nothing after a toggle to muted, without `muted` in play's dependencies", async () => {
    renderHarness();

    fireEvent.click(screen.getByText("toggle-mute"));
    fireEvent.click(screen.getByText("one"));

    await waitFor(() => expect(screen.getByText("silent")).toBeInTheDocument());
    expect(MockAudio.instances).toHaveLength(0);
  });

  it("renders, unmuted, when storage throws on read", () => {
    // Safari with cookies blocked and locked-down WebViews throw on any storage access; this used to hit the global error screen.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    renderHarness();

    expect(screen.getByText("silent")).toBeInTheDocument();
  });
});
