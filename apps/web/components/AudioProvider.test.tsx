import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioProvider, useAudio } from "./AudioProvider";

/**
 * `HTMLAudioElement` is the external boundary here — jsdom has no media stack,
 * so it is stubbed. The single-channel rule itself is not mocked: the assertion
 * is that the *first* element was paused when a second clip started.
 */
class MockAudio {
  static instances: MockAudio[] = [];

  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  currentTime = 0;
  addEventListener = vi.fn();
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
});
