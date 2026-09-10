import { describe, expect, it } from "vitest";
import { formatMinutes } from "./duration";

/**
 * The translate function is a spy that echoes its key and params, so the
 * assertions are about which rule fired rather than about English copy — the copy
 * lives in the locale files and is free to change.
 */
function echo(key: string, params?: Record<string, unknown>): string {
  return `${key}(${JSON.stringify(params ?? {})})`;
}

describe("formatMinutes", () => {
  it("shows plain minutes below an hour", () => {
    expect(formatMinutes(12, echo)).toBe(
      'dashboard.durationMinutes({"count":12})',
    );
  });

  it("shows zero rather than an empty string", () => {
    expect(formatMinutes(0, echo)).toBe(
      'dashboard.durationMinutes({"count":0})',
    );
  });

  it("drops the minutes part on a whole hour", () => {
    expect(formatMinutes(120, echo)).toBe(
      'dashboard.durationHours({"count":2})',
    );
  });

  it("shows hours and minutes past an hour", () => {
    expect(formatMinutes(95, echo)).toBe(
      'dashboard.durationHoursMinutes({"hours":1,"minutes":35})',
    );
  });

  it("switches at exactly sixty minutes", () => {
    expect(formatMinutes(59, echo)).toContain("durationMinutes");
    expect(formatMinutes(60, echo)).toContain("durationHours");
  });

  it("clamps a negative figure rather than rendering a minus sign", () => {
    expect(formatMinutes(-5, echo)).toBe(
      'dashboard.durationMinutes({"count":0})',
    );
  });
});
