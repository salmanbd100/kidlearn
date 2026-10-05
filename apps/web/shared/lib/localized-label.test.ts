import { describe, expect, it } from "vitest";
import { pickLabel } from "./localized-label";

describe("pickLabel", () => {
  it("shows the Bangla label to a Bangla reader", () => {
    expect(pickLabel({ en: "Letters", bn: "বর্ণমালা" }, "bn")).toBe("বর্ণমালা");
  });

  it("falls back to English when the Bangla label is missing or blank", () => {
    expect(pickLabel({ en: "Letters", bn: null }, "bn")).toBe("Letters");
    // The API treats a blank translation as missing; the dashboard used to render the empty string.
    expect(pickLabel({ en: "Letters", bn: "  " }, "bn")).toBe("Letters");
  });

  it("treats an unknown language as English", () => {
    expect(pickLabel({ en: "Letters", bn: "বর্ণমালা" }, "fr")).toBe("Letters");
  });
});
