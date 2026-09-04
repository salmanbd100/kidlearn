import { describe, expect, it } from "vitest";
import { evaluateScreenTime } from "./screenTimeService.js";

// The whole of the screen-time rule, tested without a database or a clock.

/** The permissive case — every test overrides only what it is about. */
const OPEN = {
  minutesToday: 0,
  dailyLimitMinutes: null,
  localTime: "12:00",
  windowStart: null,
  windowEnd: null,
  hasInProgressLesson: false,
} as const;

describe("evaluateScreenTime", () => {
  it("allows a child with no settings at all", () => {
    expect(evaluateScreenTime(OPEN)).toEqual({ allowed: true });
  });

  describe("the daily limit", () => {
    it("allows a child under the limit", () => {
      expect(
        evaluateScreenTime({
          ...OPEN,
          minutesToday: 29,
          dailyLimitMinutes: 30,
        }),
      ).toEqual({ allowed: true });
    });

    it("blocks a child exactly at the limit", () => {
      expect(
        evaluateScreenTime({
          ...OPEN,
          minutesToday: 30,
          dailyLimitMinutes: 30,
        }),
      ).toEqual({ allowed: false, code: "TIME_LIMIT_REACHED" });
    });

    it("blocks a child past the limit", () => {
      expect(
        evaluateScreenTime({
          ...OPEN,
          minutesToday: 31,
          dailyLimitMinutes: 30,
        }),
      ).toEqual({ allowed: false, code: "TIME_LIMIT_REACHED" });
    });

    it("ignores minutes when no limit is set", () => {
      expect(evaluateScreenTime({ ...OPEN, minutesToday: 600 })).toEqual({
        allowed: true,
      });
    });
  });

  describe("the access window", () => {
    const DAYTIME = { windowStart: "07:00", windowEnd: "19:00" } as const;

    it("allows a time inside the window", () => {
      expect(
        evaluateScreenTime({ ...OPEN, ...DAYTIME, localTime: "12:00" }),
      ).toEqual({ allowed: true });
    });

    it("allows the opening minute — the start is inclusive", () => {
      expect(
        evaluateScreenTime({ ...OPEN, ...DAYTIME, localTime: "07:00" }),
      ).toEqual({ allowed: true });
    });

    it("blocks the closing minute — the end is exclusive", () => {
      expect(
        evaluateScreenTime({ ...OPEN, ...DAYTIME, localTime: "19:00" }),
      ).toEqual({ allowed: false, code: "OUTSIDE_WINDOW" });
    });

    it("blocks a time before the window opens", () => {
      expect(
        evaluateScreenTime({ ...OPEN, ...DAYTIME, localTime: "06:59" }),
      ).toEqual({ allowed: false, code: "OUTSIDE_WINDOW" });
    });

    it("blocks a time after the window closes", () => {
      expect(
        evaluateScreenTime({ ...OPEN, ...DAYTIME, localTime: "21:30" }),
      ).toEqual({ allowed: false, code: "OUTSIDE_WINDOW" });
    });
  });

  describe("a window that wraps midnight", () => {
    const OVERNIGHT = { windowStart: "20:00", windowEnd: "07:00" } as const;

    it("allows an evening time after the start", () => {
      expect(
        evaluateScreenTime({ ...OPEN, ...OVERNIGHT, localTime: "21:30" }),
      ).toEqual({ allowed: true });
    });

    it("allows an early-morning time before the end", () => {
      expect(
        evaluateScreenTime({ ...OPEN, ...OVERNIGHT, localTime: "06:30" }),
      ).toEqual({ allowed: true });
    });

    it("allows midnight itself", () => {
      expect(
        evaluateScreenTime({ ...OPEN, ...OVERNIGHT, localTime: "00:00" }),
      ).toEqual({ allowed: true });
    });

    it("blocks the middle of the day", () => {
      expect(
        evaluateScreenTime({ ...OPEN, ...OVERNIGHT, localTime: "12:00" }),
      ).toEqual({ allowed: false, code: "OUTSIDE_WINDOW" });
    });
  });

  /**
   * The degenerate case, and the reason it is not an error: a parent dragging two
   * time inputs to the same value has expressed nothing, and the only reading that
   * cannot lock a child out of the app all day is "no window".
   */
  it("treats a zero-length window as no window at all", () => {
    expect(
      evaluateScreenTime({
        ...OPEN,
        windowStart: "08:00",
        windowEnd: "08:00",
        localTime: "23:00",
      }),
    ).toEqual({ allowed: true });
  });

  it("ignores a half-set window rather than guessing the missing end", () => {
    expect(
      evaluateScreenTime({
        ...OPEN,
        windowStart: "08:00",
        windowEnd: null,
        localTime: "23:00",
      }),
    ).toEqual({ allowed: true });
  });

  /**
   * Precedence is not cosmetic: it decides which of two mascot screens a child
   * sees, and "see you at 8 o'clock" is actionable where "come back tomorrow" is
   * merely true.
   */
  it("reports the window when both the window and the limit would block", () => {
    expect(
      evaluateScreenTime({
        minutesToday: 60,
        dailyLimitMinutes: 30,
        localTime: "22:00",
        windowStart: "07:00",
        windowEnd: "19:00",
        hasInProgressLesson: false,
      }),
    ).toEqual({ allowed: false, code: "OUTSIDE_WINDOW" });
  });

  describe("the in-progress exemption (FR-TIME-03)", () => {
    it("lets a child finish a lesson after the limit is reached", () => {
      expect(
        evaluateScreenTime({
          ...OPEN,
          minutesToday: 90,
          dailyLimitMinutes: 30,
          hasInProgressLesson: true,
        }),
      ).toEqual({ allowed: true });
    });

    it("lets a child finish a lesson outside the window", () => {
      expect(
        evaluateScreenTime({
          ...OPEN,
          localTime: "23:00",
          windowStart: "07:00",
          windowEnd: "19:00",
          hasInProgressLesson: true,
        }),
      ).toEqual({ allowed: true });
    });

    it("lets a child finish a lesson when both rules would block", () => {
      expect(
        evaluateScreenTime({
          minutesToday: 200,
          dailyLimitMinutes: 15,
          localTime: "03:00",
          windowStart: "07:00",
          windowEnd: "19:00",
          hasInProgressLesson: true,
        }),
      ).toEqual({ allowed: true });
    });
  });
});
