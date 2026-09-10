import { describe, expect, it } from "vitest";
import { pickLocale, toLocaleMap } from "./locale.js";

describe("pickLocale", () => {
  it("returns the requested locale when it is present", () => {
    expect(pickLocale({ en: "Letters", bn: "বর্ণমালা" }, "bn")).toEqual({
      value: "বর্ণমালা",
      locale: "bn",
    });
  });

  it("falls back to English when the requested locale is missing", () => {
    expect(pickLocale({ en: "Letters" }, "bn")).toEqual({
      value: "Letters",
      locale: "en",
    });
  });

  it("falls back to English when the requested locale is present but empty", () => {
    // A LessonTranslation row can exist for `bn` while the field it carries —
    // a video asset, say — is null.
    expect(pickLocale({ en: "https://a/en.mp4", bn: null }, "bn")).toEqual({
      value: "https://a/en.mp4",
      locale: "en",
    });
  });

  it("reports the English locale when nothing is available at all", () => {
    expect(pickLocale(null, "bn")).toEqual({ value: null, locale: "en" });
    expect(pickLocale({}, "en")).toEqual({ value: null, locale: "en" });
  });

  it("never falls back from English to Bangla", () => {
    expect(pickLocale({ bn: "বর্ণমালা" }, "en")).toEqual({
      value: null,
      locale: "en",
    });
  });
});

describe("toLocaleMap", () => {
  it("keys translation rows by their language column", () => {
    const rows = [
      { language: "en" as const, introScript: "Hello!" },
      { language: "bn" as const, introScript: "হ্যালো!" },
    ];

    expect(toLocaleMap(rows, (row) => row.introScript)).toEqual({
      en: "Hello!",
      bn: "হ্যালো!",
    });
  });

  it("normalises an absent selected field to null so pickLocale can fall back", () => {
    const rows = [
      { language: "en" as const, videoUrl: "https://a/en.mp4" },
      { language: "bn" as const, videoUrl: undefined },
    ];

    const map = toLocaleMap(rows, (row) => row.videoUrl);

    expect(map).toEqual({ en: "https://a/en.mp4", bn: null });
    expect(pickLocale(map, "bn").value).toBe("https://a/en.mp4");
  });

  it("returns an empty map for a lesson with no translations", () => {
    expect(toLocaleMap(undefined, () => "x")).toEqual({});
  });
});
