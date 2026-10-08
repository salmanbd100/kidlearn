import { describe, expect, it } from "vitest";
import { localDateIn } from "./local-date.js";

describe("localDateIn", () => {
  it("formats as yyyy-MM-dd with zero padding", () => {
    expect(localDateIn("UTC", new Date("2026-03-07T12:00:00.000Z"))).toBe(
      "2026-03-07",
    );
  });

  it("returns the local day, not the UTC one, for an instant either side of midnight", () => {
    // 21:30 UTC is already tomorrow in Dhaka (+06); the day grant must not double up when the server's date rolls over.
    expect(
      localDateIn("Asia/Dhaka", new Date("2026-03-07T21:30:00.000Z")),
    ).toBe("2026-03-08");
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
