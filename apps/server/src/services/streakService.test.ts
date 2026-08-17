import { describe, expect, it } from "vitest";
import { previousLocalDate } from "../lib/local-date.js";
import { computeStreakUpdate, type StreakState } from "./streakService.js";

/**
 * The day-boundary rule, tested where it is pure (`general.md §5`). The Prisma
 * half — reading the `@db.Date` column and upserting the row — is exercised
 * through `routes/progress.test.ts`, where a seeded streak is what makes the
 * badge integration meaningful.
 */

const TODAY = "2026-08-17";
const YESTERDAY = previousLocalDate(TODAY);

function update(previous: Partial<StreakState> = {}) {
  return computeStreakUpdate(
    { current: 0, longest: 0, lastActivityDate: null, ...previous },
    TODAY,
    YESTERDAY,
  );
}

describe("computeStreakUpdate", () => {
  it("starts a streak at one on a child's very first activity", () => {
    expect(update()).toEqual({
      current: 1,
      longest: 1,
      isNewDay: true,
      milestone: null,
    });
  });

  it("changes nothing when the child was already active today", () => {
    // A child who finishes four lessons in an afternoon has learned on one day.
    expect(update({ current: 5, longest: 9, lastActivityDate: TODAY })).toEqual(
      {
        current: 5,
        longest: 9,
        isNewDay: false,
        milestone: null,
      },
    );
  });

  it("extends the streak when the last activity was yesterday", () => {
    expect(
      update({ current: 4, longest: 4, lastActivityDate: YESTERDAY }),
    ).toMatchObject({ current: 5, longest: 5, isNewDay: true });
  });

  it("resets to one after a gap, keeping the longest run on record", () => {
    // The streak is broken; what the child once did is not.
    expect(
      update({ current: 9, longest: 9, lastActivityDate: "2026-08-10" }),
    ).toEqual({
      current: 1,
      longest: 9,
      isNewDay: true,
      milestone: null,
    });
  });

  it("keeps longest at the previous best when the new run has not passed it", () => {
    expect(
      update({ current: 2, longest: 12, lastActivityDate: YESTERDAY }),
    ).toMatchObject({ current: 3, longest: 12 });
  });

  it("flags the milestone on the day the streak reaches three", () => {
    expect(
      update({ current: 2, longest: 2, lastActivityDate: YESTERDAY }),
    ).toMatchObject({ current: 3, milestone: 3 });
  });

  it("flags the milestone on the day the streak reaches seven", () => {
    expect(
      update({ current: 6, longest: 6, lastActivityDate: YESTERDAY }),
    ).toMatchObject({ current: 7, milestone: 7 });
  });

  it("flags no milestone on the days between and after", () => {
    // A flame that played every day after the third would stop meaning anything
    // by the fourth.
    for (const current of [1, 3, 5, 7, 8, 20]) {
      expect(
        update({ current, longest: current, lastActivityDate: YESTERDAY }),
      ).toMatchObject({ milestone: null });
    }
  });

  it("flags no milestone on a second completion on the milestone day itself", () => {
    // `current` is already 3, but no new day was reached — the party has been
    // had, and a child who plays twice must not get it twice.
    expect(update({ current: 3, longest: 3, lastActivityDate: TODAY })).toEqual(
      { current: 3, longest: 3, isNewDay: false, milestone: null },
    );
  });

  it("flags the milestone again when a broken streak climbs back to three", () => {
    // Not the same streak, so genuinely a new achievement. The badge does not
    // repeat — the ledger's unique index sees to that — but the celebration does.
    expect(
      update({ current: 2, longest: 30, lastActivityDate: YESTERDAY }),
    ).toMatchObject({ current: 3, milestone: 3 });
  });
});

describe("previousLocalDate", () => {
  it("steps back one calendar day", () => {
    expect(previousLocalDate("2026-08-17")).toBe("2026-08-16");
  });

  it("steps across a month boundary", () => {
    expect(previousLocalDate("2026-08-01")).toBe("2026-07-31");
  });

  it("steps across a year boundary", () => {
    expect(previousLocalDate("2026-01-01")).toBe("2025-12-31");
  });

  it("knows about leap days", () => {
    expect(previousLocalDate("2028-03-01")).toBe("2028-02-29");
  });
});
