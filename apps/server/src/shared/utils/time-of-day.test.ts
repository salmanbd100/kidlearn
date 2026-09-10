import { describe, expect, it } from "vitest";
import {
  dateToTimeOfDay,
  timeOfDayToDate,
  toMinutesOfDay,
} from "./time-of-day.js";

const EVERY_QUARTER_HOUR = [
  "00:00",
  "00:15",
  "07:30",
  "12:00",
  "19:45",
  "23:59",
];

describe("toMinutesOfDay", () => {
  it.each([
    ["00:00", 0],
    ["00:01", 1],
    ["07:30", 450],
    ["12:00", 720],
    ["23:59", 1439],
  ])("reads %s as %i minutes", (timeOfDay, minutes) => {
    expect(toMinutesOfDay(timeOfDay)).toBe(minutes);
  });
});

describe("the Time(0) round trip", () => {
  it.each(EVERY_QUARTER_HOUR)("round-trips %s unchanged", (timeOfDay) => {
    expect(dateToTimeOfDay(timeOfDayToDate(timeOfDay))).toBe(timeOfDay);
  });

  it("pins the date part to the epoch, which the column ignores", () => {
    expect(timeOfDayToDate("19:00").toISOString()).toBe(
      "1970-01-01T19:00:00.000Z",
    );
  });

  /**
   * The failure this file exists to prevent. A `Date` carrying 19:00 in UTC is
   * 19:00 in the column; reading it back through anything zone-aware on a server
   * set to Asia/Dhaka would say 01:00, and a bedtime would move six hours.
   */
  it("reads a value back without applying a local offset", () => {
    const stored = new Date("1970-01-01T19:00:00.000Z");

    expect(dateToTimeOfDay(stored)).toBe("19:00");
  });

  it("drops the seconds a Time(0) column cannot hold", () => {
    expect(dateToTimeOfDay(new Date("1970-01-01T08:15:59.000Z"))).toBe("08:15");
  });
});
