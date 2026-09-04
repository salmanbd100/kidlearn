/**
 * The pure half of learning time: heartbeat density → minutes, and a range name →
 * two instants.
 */
import { describe, expect, it } from "vitest";
import { localDayStartUtc } from "../lib/local-date.js";
import {
  computeLearningMinutes,
  LEARNING_TIME_GAP_MS,
  LEARNING_TIME_TAIL_MS,
  learningTimeWindow,
} from "./learningTimeService.js";

const TZ = "Asia/Dhaka";

/** A wide window, so a test that is not about the range edges is not about them. */
const FROM = new Date("2026-08-18T00:00:00.000Z");
const TO = new Date("2026-08-19T00:00:00.000Z");

/** `n` heartbeats at the client's 30s cadence, starting at `start`. */
function beatsFrom(start: string, count: number): Date[] {
  const first = new Date(start).getTime();
  return Array.from(
    { length: count },
    (_, index) => new Date(first + index * 30_000),
  );
}

describe("computeLearningMinutes", () => {
  it("returns 0 for no events at all", () => {
    expect(computeLearningMinutes([], FROM, TO)).toBe(0);
  });

  it("credits a lone event the heartbeat interval it stands for", () => {
    // A single beat is 30s of presence, and 30s rounds to 1 minute. Asserting the
    // rounding rather than the seconds: `Math.round(0.5)` is the one boundary in
    // this function a reader would guess wrong, so it is pinned here.
    expect(
      computeLearningMinutes([new Date("2026-08-18T09:00:00.000Z")], FROM, TO),
    ).toBe(1);
    expect(LEARNING_TIME_TAIL_MS).toBe(30_000);
  });

  it("measures a dense run end to end plus the tail credit", () => {
    // 21 beats at 30s = 10 minutes between first and last, + 30s tail = 10.5 →
    // rounds to 11.
    expect(
      computeLearningMinutes(beatsFrom("2026-08-18T09:00:00Z", 21), FROM, TO),
    ).toBe(11);
  });

  it("keeps one session across a gap of exactly 90 seconds", () => {
    const start = new Date("2026-08-18T09:00:00.000Z").getTime();
    const events = [
      new Date(start),
      new Date(start + LEARNING_TIME_GAP_MS),
      new Date(start + LEARNING_TIME_GAP_MS + 30_000),
    ];

    // One session: 120s spanned + 30s tail = 2.5 min → 3.
    expect(computeLearningMinutes(events, FROM, TO)).toBe(3);
  });

  it("splits into two sessions on a gap of 91 seconds", () => {
    const start = new Date("2026-08-18T09:00:00.000Z").getTime();
    const events = [
      new Date(start),
      new Date(start + LEARNING_TIME_GAP_MS + 1_000),
    ];

    // Two lone events, 30s each — the walk-away between them is not counted.
    expect(computeLearningMinutes(events, FROM, TO)).toBe(1);
  });

  it("sorts unsorted input rather than trusting the caller's order", () => {
    const inOrder = beatsFrom("2026-08-18T09:00:00Z", 21);
    const shuffled = [...inOrder].reverse();

    expect(computeLearningMinutes(shuffled, FROM, TO)).toBe(
      computeLearningMinutes(inOrder, FROM, TO),
    );
  });

  it("ignores events outside [from, to)", () => {
    const events = [
      new Date("2026-08-17T23:59:59.000Z"), // before `from`
      new Date("2026-08-18T09:00:00.000Z"), // inside
      TO, // exactly `to` — excluded, the range is half-open
      new Date("2026-08-19T01:00:00.000Z"), // after `to`
    ];

    expect(computeLearningMinutes(events, FROM, TO)).toBe(1);
  });

  it("counts every event type, not only heartbeats", () => {
    // The point of the signature: a lesson_complete arriving between two beats
    // keeps the session alive, because the caller passes timestamps and the
    // function never sees a type.
    const start = new Date("2026-08-18T09:00:00.000Z").getTime();
    const events = [
      new Date(start),
      // 80s later — inside the gap only because this event exists.
      new Date(start + 80_000),
      new Date(start + 160_000),
    ];

    // 160s spanned + 30s tail = 3.17 min → 3. Drop the middle event and the run
    // becomes two lone beats worth 1 minute between them.
    expect(computeLearningMinutes(events, FROM, TO)).toBe(3);
    expect(computeLearningMinutes([events[0], events[2]], FROM, TO)).toBe(1);
  });

  it("splits a session that crosses midnight between the two days it spans", () => {
    // 23:58 to 00:04 local, in Dhaka. Every beat is inside one sitting, but the
    // two queries see different halves of it.
    const midnight = localDayStartUtc(TZ, "2026-08-19");
    const beats = Array.from(
      { length: 13 },
      (_, index) => new Date(midnight.getTime() + (index - 4) * 30_000),
    );

    const dayOne = computeLearningMinutes(
      beats,
      localDayStartUtc(TZ, "2026-08-18"),
      midnight,
    );
    const dayTwo = computeLearningMinutes(
      beats,
      midnight,
      localDayStartUtc(TZ, "2026-08-20"),
    );

    // Four beats before midnight span 90s, + 30s tail = 2 min exactly.
    expect(dayOne).toBe(2);
    // Nine after span 240s, + 30s = 4.5 → 5.
    expect(dayTwo).toBe(5);
    // Each day's tail credit lands in its own range, so the split adds one beat
    // interval that the unsplit sitting would not have counted. That is the
    // documented cost of crediting a period the moment it is queried.
    expect(dayOne + dayTwo).toBe(7);
  });

  it("measures a realistic twenty-minute lesson with a break in the middle", () => {
    const events = [
      // Twelve minutes of lesson, then the child wanders off for four, then eight
      // minutes more.
      ...beatsFrom("2026-08-18T09:00:00Z", 25),
      ...beatsFrom("2026-08-18T09:16:00Z", 17),
    ];

    // 12 min + 30s, then 8 min + 30s = 21.
    expect(computeLearningMinutes(events, FROM, TO)).toBe(21);
  });
});

describe("learningTimeWindow", () => {
  // Tuesday, 18 August 2026, 15:30 in Dhaka (09:30 UTC).
  const NOW = new Date("2026-08-18T09:30:00.000Z");

  it("bounds today by local midnight, not UTC midnight", () => {
    const { from, to } = learningTimeWindow("today", NOW, TZ);

    // 18:00 UTC the previous day is midnight in Dhaka (+06).
    expect(from.toISOString()).toBe("2026-08-17T18:00:00.000Z");
    expect(to.toISOString()).toBe("2026-08-18T18:00:00.000Z");
  });

  it("starts the week on Monday", () => {
    const { from, to } = learningTimeWindow("week", NOW, TZ);

    // Monday 17 August local — the day before the Tuesday `NOW` falls on.
    expect(from.toISOString()).toBe("2026-08-16T18:00:00.000Z");
    expect(to.toISOString()).toBe("2026-08-23T18:00:00.000Z");
  });

  it("treats a Sunday as the end of its week, not the start of the next", () => {
    // Sunday 23 August 2026, 10:00 Dhaka. `startOfWeek(weekStartsOn: 1)` on a
    // Sunday is six days back, which is the one weekday the arithmetic gets wrong
    // if it reads Sunday as day 0 of its own week.
    const sunday = new Date("2026-08-23T04:00:00.000Z");
    const { from } = learningTimeWindow("week", sunday, TZ);

    expect(from.toISOString()).toBe("2026-08-16T18:00:00.000Z");
  });

  it("bounds the month by the calendar, and rolls the year over in December", () => {
    const august = learningTimeWindow("month", NOW, TZ);
    expect(august.from.toISOString()).toBe("2026-07-31T18:00:00.000Z");
    expect(august.to.toISOString()).toBe("2026-08-31T18:00:00.000Z");

    const december = learningTimeWindow(
      "month",
      new Date("2026-12-20T06:00:00.000Z"),
      TZ,
    );
    expect(december.to.toISOString()).toBe("2026-12-31T18:00:00.000Z");
  });

  it("resolves the offset per instant, so a DST zone gets a true local midnight", () => {
    // New York on 8 March 2026 — the spring-forward day. Midnight is EST (−05),
    // the following midnight EDT (−04), so the window is 23 hours long. Nothing in
    // the MVP deployment observes DST; this asserts the arithmetic does not depend
    // on that being true.
    const { from, to } = learningTimeWindow(
      "today",
      new Date("2026-03-08T18:00:00.000Z"),
      "America/New_York",
    );

    expect(from.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(to.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
});
