import { describe, expect, it } from "vitest";
import { redactAnalyticsUrl } from "./analytics";

function redact(url: string): string {
  return redactAnalyticsUrl({ type: "pageview", url }).url;
}

describe("redactAnalyticsUrl", () => {
  it("drops the query string, which carries ?child=<id>", () => {
    expect(redact("https://kidlearn.app/parent?child=ck123&tab=progress")).toBe(
      "https://kidlearn.app/parent",
    );
  });

  it("drops the fragment", () => {
    expect(redact("https://kidlearn.app/guide/parent#consent")).toBe(
      "https://kidlearn.app/guide/parent",
    );
  });

  it("replaces a child id in the profile path with its route pattern", () => {
    expect(redact("https://kidlearn.app/parent/children/ck123/edit")).toBe(
      "https://kidlearn.app/parent/children/[id]/edit",
    );
  });

  it("leaves content ids alone", () => {
    expect(redact("https://kidlearn.app/lesson/lsn_42")).toBe(
      "https://kidlearn.app/lesson/lsn_42",
    );
  });

  it("keeps the event type", () => {
    expect(
      redactAnalyticsUrl({ type: "event", url: "https://kidlearn.app/?a=1" }),
    ).toEqual({ type: "event", url: "https://kidlearn.app/" });
  });
});
