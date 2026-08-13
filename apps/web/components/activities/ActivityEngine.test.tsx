import {
  invalidActivityUnknownType,
  invalidDragDropUnmappedItem,
  validDragDrop,
  validMatch,
  validTrace,
} from "@kidlearn/types";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { ActivityEngine, CELEBRATION_MS } from "./ActivityEngine";

const audio = vi.hoisted(() => ({
  play: vi.fn(async () => {}),
  stop: vi.fn(),
  isPlaying: false,
  muted: false,
  setMuted: vi.fn(),
}));

vi.mock("@/components/AudioProvider", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/AudioProvider")
  >("@/components/AudioProvider");
  return { ...actual, useAudio: () => audio };
});

// jsdom has no canvas 2d context, so the real library throws on first burst.
vi.mock("canvas-confetti", () => ({
  default: Object.assign(vi.fn(), { create: () => vi.fn() }),
}));

function renderEngine(definition: unknown, locale: "en" | "bn" = "en") {
  const onComplete = vi.fn();
  render(
    <Providers locale={locale}>
      <ActivityEngine
        definition={definition}
        locale={locale}
        onComplete={onComplete}
      />
    </Providers>,
  );
  return onComplete;
}

describe("ActivityEngine", () => {
  beforeEach(() => {
    resetI18nForTests();
    audio.play.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("parse and dispatch (FR-ACT-06)", () => {
    it("renders the drag-drop renderer for a drag-drop payload", () => {
      renderEngine(validDragDrop);

      expect(screen.getByTestId("activity-drag-drop")).toBeInTheDocument();
    });

    it("renders the trace renderer for a trace payload", () => {
      renderEngine(validTrace);

      expect(screen.getByTestId("activity-trace")).toBeInTheDocument();
    });

    it("renders the placeholder renderer for a type no file has built yet", () => {
      renderEngine(validMatch);

      expect(screen.getByTestId("activity-coming-soon")).toBeInTheDocument();
    });

    it("shows the oops screen instead of crashing on an unknown type", () => {
      renderEngine(invalidActivityUnknownType);

      expect(screen.getByTestId("activity-oops")).toBeInTheDocument();
      expect(
        screen.queryByTestId("activity-drag-drop"),
      ).not.toBeInTheDocument();
    });

    it("shows the oops screen for a payload of the right type but broken content", () => {
      renderEngine(invalidDragDropUnmappedItem);

      expect(screen.getByTestId("activity-oops")).toBeInTheDocument();
    });

    it("never traps the child behind a broken payload — skip completes the step", () => {
      const onComplete = renderEngine(invalidActivityUnknownType);

      fireEvent.click(screen.getByRole("button", { name: /Let's go on!/ }));

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("logs the validation failure for whoever authored the payload", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      renderEngine(invalidActivityUnknownType);

      expect(error).toHaveBeenCalled();
      error.mockRestore();
    });

    it("speaks a friendly prompt on the oops screen rather than sitting silent", () => {
      renderEngine(invalidActivityUnknownType);

      expect(audio.play).toHaveBeenCalledWith(
        "/audio/feedback/oops-en.mp3",
        expect.objectContaining({ interrupt: true }),
      );
    });
  });

  describe("instruction audio (NFR-A11Y-01)", () => {
    it("plays the instruction on mount without waiting for a tap", () => {
      renderEngine(validDragDrop);

      expect(audio.play).toHaveBeenCalledWith(
        validDragDrop.instructionAudio.en.url,
        expect.objectContaining({ interrupt: true }),
      );
    });

    it("plays the child's own locale, not English", () => {
      renderEngine(validDragDrop, "bn");

      expect(audio.play).toHaveBeenCalledWith(
        validDragDrop.instructionAudio.bn.url,
        expect.objectContaining({ interrupt: true }),
      );
    });

    it("replays the instruction from a control the child can hit", () => {
      renderEngine(validDragDrop);
      audio.play.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Say it again" }));

      expect(audio.play).toHaveBeenCalledWith(
        validDragDrop.instructionAudio.en.url,
        expect.objectContaining({ interrupt: true }),
      );
    });
  });

  describe("completion (FR-ACT-05)", () => {
    it("celebrates before handing the step back, and completes exactly once", () => {
      vi.useFakeTimers();
      const onComplete = renderEngine(validMatch);

      fireEvent.click(screen.getByRole("button", { name: /Done!/ }));

      expect(screen.getByTestId("activity-celebration")).toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(CELEBRATION_MS);
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("lets an impatient child tap through the celebration", () => {
      vi.useFakeTimers();
      const onComplete = renderEngine(validMatch);

      fireEvent.click(screen.getByRole("button", { name: /Done!/ }));
      fireEvent.click(screen.getByTestId("activity-celebration"));

      expect(onComplete).toHaveBeenCalledTimes(1);

      // The timer that was already running must not complete the step twice.
      act(() => {
        vi.advanceTimersByTime(CELEBRATION_MS * 2);
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});
