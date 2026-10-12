import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyBlock } from "./CopyBlock";

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
}

async function click(name: string | RegExp): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("CopyBlock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("copies the text and says so, then resets", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    render(<CopyBlock label="Prompt" text="Hello" />);

    await click("Copy");

    expect(writeText).toHaveBeenCalledWith("Hello");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("keeps Copied for the full time after a second click", async () => {
    stubClipboard(() => Promise.resolve());
    render(<CopyBlock label="Prompt" text="Hello" />);

    await click("Copy");
    act(() => vi.advanceTimersByTime(1500));
    await click("Copied");
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("tells the admin when the browser refuses the clipboard", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    render(<CopyBlock label="Prompt" text="Hello" />);

    await click("Copy");

    expect(
      screen.getByRole("button", { name: /Copy failed/ }),
    ).toBeInTheDocument();
  });

  it("tells the admin when there is no clipboard at all", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    render(<CopyBlock label="Prompt" text="Hello" />);

    await click("Copy");

    expect(
      screen.getByRole("button", { name: /Copy failed/ }),
    ).toBeInTheDocument();
  });
});
