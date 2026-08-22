import { describe, expect, it } from "vitest";
import { formatWeekRange } from "./week-range";

/**
 * The edges are the whole reason this is a function: a week inside one month, one
 * that crosses a month, one that crosses a year, and Bangla — which uses its own
 * digits *and* puts the month last, so a Latin-numeral assertion would pass
 * against a locale-blind implementation.
 *
 * Assertions are on structure rather than exact strings wherever ICU owns the
 * shape: month abbreviations and range separators move between Node versions, and
 * a test that pins them fails on an upgrade that broke nothing.
 */

const MONDAY = "2026-08-17T00:00:00.000Z";
const SUNDAY = "2026-08-23T00:00:00.000Z";

describe("formatWeekRange", () => {
  it("names the month once for a week inside one month", () => {
    const range = formatWeekRange(MONDAY, SUNDAY, "en");

    // The separator is ICU's own — a thin-space-wrapped en dash — so it is matched
    // rather than typed out: pinning invisible whitespace fails on a Node upgrade
    // that broke nothing.
    expect(range).toMatch(/^Aug 17\s*–\s*23$/);
    // The point of `formatRange`: the shared field is elided in the position the
    // locale puts it, which a hand-rolled join cannot do.
    expect(range.match(/Aug/g)).toHaveLength(1);
  });

  it("names both months for a week that crosses one", () => {
    expect(
      formatWeekRange(
        "2026-08-31T00:00:00.000Z",
        "2026-09-06T00:00:00.000Z",
        "en",
      ),
    ).toMatch(/^Aug 31\s*–\s*Sep 6$/);
  });

  it("adds the year only when the two ends disagree about it", () => {
    const newYear = formatWeekRange(
      "2026-12-28T00:00:00.000Z",
      "2027-01-03T00:00:00.000Z",
      "en",
    );

    // Both years, so a week spanning New Year is not reported as seven days in
    // one of them.
    expect(newYear).toContain("2026");
    expect(newYear).toContain("2027");
    // And an ordinary week is not padded with a year the parent already knows.
    expect(formatWeekRange(MONDAY, SUNDAY, "en")).not.toContain("2026");
  });

  it("reads the dates as UTC, so a week never shifts by a day", () => {
    // The server sends a date column serialised in full. Read in the browser's
    // zone, every week would render a day early west of Greenwich — and the week
    // belongs to the household's calendar, not to the device.
    expect(formatWeekRange(MONDAY, SUNDAY, "en")).toContain("17");
    expect(formatWeekRange(MONDAY, SUNDAY, "en")).toContain("23");
  });

  it("renders Bangla in its own digits and month names", () => {
    const range = formatWeekRange(MONDAY, SUNDAY, "bn");

    expect(range).not.toMatch(/[0-9]/);
    expect(range).not.toContain("Aug");
    expect(range).toContain("১৭");
    expect(range).toContain("২৩");
  });

  it("falls back to English for a locale this app does not ship", () => {
    expect(formatWeekRange(MONDAY, SUNDAY, "fr-CA")).toMatch(
      /^Aug 17\s*–\s*23$/,
    );
  });
});
