import { describe, expect, it } from "vitest";
import { localDateIn } from "./local-date.js";

describe("localDateIn", () => {
  it("formats as yyyy-MM-dd with zero padding", () => {
    expect(localDateIn("UTC", new Date("2026-03-07T12:00:00.000Z"))).toBe(
      "2026-03-07",
    );
  });

  it("returns the local day, not the UTC one, for an instant either side of midnight", () => {
    // 21:30 UTC is already tomorrow in Dhaka (+06). A child playing in the
    // evening must not be handed a second first-activity-of-the-day grant when
    // the server's own date rolls over six hours later.
    expect(
      localDateIn("Asia/Dhaka", new Date("2026-03-07T21:30:00.000Z")),
    ).toBe("2026-03-08");
    // The minute before it, on the same UTC day, is still the 7th.
    expect(
      localDateIn("Asia/Dhaka", new Date("2026-03-07T17:59:00.000Z")),
    ).toBe("2026-03-07");
  });

  it("handles a zone behind UTC", () => {
    expect(
      localDateIn("America/New_York", new Date("2026-03-08T02:00:00Z")),
    ).toBe("2026-03-07");
  });
});
