import { describe, expect, it } from "vitest";
import { formatAbsolute, formatRelative } from "./relative-time";

/**
 * `now` is passed in rather than frozen with fake timers: the point of the
 * helper's signature is that a date's rendering is a pure function of two
 * instants, so every rule below is one assertion instead of a controlled clock.
 */
const NOW = new Date("2026-08-19T12:00:00.000Z");

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("formatRelative", () => {
  it("says now for anything inside the last minute", () => {
    expect(formatRelative(ago(20_000), "en", NOW)).toBe("now");
  });

  it("counts minutes below an hour", () => {
    expect(formatRelative(ago(3 * MINUTE), "en", NOW)).toBe("3 minutes ago");
  });

  it("counts hours below a day", () => {
    expect(formatRelative(ago(5 * HOUR), "en", NOW)).toBe("5 hours ago");
  });

  it("never rounds a figure out of the bucket that selected it", () => {
    // Both were reachable while the magnitude was `Math.round`ed: the bucket is
    // picked from the raw delta, so the last half-unit rounded into the next one.
    expect(formatRelative(ago(59 * MINUTE + 42_000), "en", NOW)).toBe(
      "59 minutes ago",
    );
    expect(formatRelative(ago(23 * HOUR + 42 * MINUTE), "en", NOW)).toBe(
      "23 hours ago",
    );
  });

  it("uses the calendar day, not a 24-hour block, beyond a day", () => {
    // 30 hours before midday on the 19th is 06:00 on the 18th — two calendar
    // days back would be wrong, and "30 hours ago" is not what a parent reads.
    expect(formatRelative(ago(30 * HOUR), "en", NOW)).toBe("yesterday");
  });

  it("counts whole days further back", () => {
    expect(formatRelative(ago(4 * 24 * HOUR), "en", NOW)).toBe("4 days ago");
  });

  it("formats in Bangla when the parent reads Bangla", () => {
    const bangla = formatRelative(ago(3 * MINUTE), "bn", NOW);

    // Asserting the locale took effect, not the exact CLDR wording, which is
    // ICU data and not this app's to promise.
    expect(bangla).not.toBe("3 minutes ago");
    expect(bangla.length).toBeGreaterThan(0);
  });

  it("falls back to the default locale rather than throwing on an unknown one", () => {
    expect(formatRelative(ago(3 * MINUTE), "fr-CA", NOW)).toBe("3 minutes ago");
  });

  it("handles a timestamp in the future without crashing", () => {
    // Clock skew between the server and a device, not a real completion.
    expect(
      formatRelative(new Date(NOW.getTime() + 3 * MINUTE), "en", NOW),
    ).toBe("in 3 minutes");
  });
});

describe("formatAbsolute", () => {
  it("spells the date out for the tooltip a relative date hangs off", () => {
    const absolute = formatAbsolute(new Date("2026-08-19T12:00:00.000Z"), "en");

    expect(absolute).toContain("2026");
    expect(absolute).toContain("August");
  });

  it("falls back to the default locale on an unsupported one", () => {
    expect(formatAbsolute(NOW, "zz")).toContain("2026");
  });
});
