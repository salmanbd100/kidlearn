import { describe, expect, it } from "vitest";
import {
  SCREEN_TIME_LIMIT_OPTIONS,
  ScreenTimeUpdateSchema,
} from "./screen-time.js";

/**
 * The boundary the parent form and the route both run. Every case here is one a
 * real body could arrive in — the form cannot produce most of them, which is
 * exactly why the server validates rather than trusting it.
 */
describe("ScreenTimeUpdateSchema", () => {
  it("accepts a limit with no window", () => {
    const result = ScreenTimeUpdateSchema.safeParse({
      dailyLimitMinutes: 30,
      windowStart: null,
      windowEnd: null,
    });

    expect(result.success).toBe(true);
  });

  it("accepts a window with no limit", () => {
    const result = ScreenTimeUpdateSchema.safeParse({
      dailyLimitMinutes: null,
      windowStart: "07:00",
      windowEnd: "19:30",
    });

    expect(result.success).toBe(true);
  });

  it("accepts everything switched off", () => {
    const result = ScreenTimeUpdateSchema.safeParse({
      dailyLimitMinutes: null,
      windowStart: null,
      windowEnd: null,
    });

    expect(result.success).toBe(true);
  });

  it.each(
    SCREEN_TIME_LIMIT_OPTIONS,
  )("accepts the %i-minute option", (limit) => {
    const result = ScreenTimeUpdateSchema.safeParse({
      dailyLimitMinutes: limit,
      windowStart: null,
      windowEnd: null,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a limit outside the offered set", () => {
    const result = ScreenTimeUpdateSchema.safeParse({
      dailyLimitMinutes: 17,
      windowStart: null,
      windowEnd: null,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a window with only a start", () => {
    const result = ScreenTimeUpdateSchema.safeParse({
      dailyLimitMinutes: null,
      windowStart: "08:00",
      windowEnd: null,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a window with only an end", () => {
    const result = ScreenTimeUpdateSchema.safeParse({
      dailyLimitMinutes: null,
      windowStart: null,
      windowEnd: "20:00",
    });

    expect(result.success).toBe(false);
  });

  it.each([
    "24:00",
    "9:30",
    "07:60",
    "0730",
    "07:30:00",
    "",
  ])("rejects %o as a time of day", (value) => {
    const result = ScreenTimeUpdateSchema.safeParse({
      dailyLimitMinutes: null,
      windowStart: value,
      windowEnd: "20:00",
    });

    expect(result.success).toBe(false);
  });

  it("accepts midnight and the last minute of the day", () => {
    const result = ScreenTimeUpdateSchema.safeParse({
      dailyLimitMinutes: null,
      windowStart: "00:00",
      windowEnd: "23:59",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unknown key", () => {
    const result = ScreenTimeUpdateSchema.safeParse({
      dailyLimitMinutes: null,
      windowStart: null,
      windowEnd: null,
      childId: "child_1",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a body missing a field, so 'off' is always explicit", () => {
    const result = ScreenTimeUpdateSchema.safeParse({ dailyLimitMinutes: 30 });

    expect(result.success).toBe(false);
  });
});
