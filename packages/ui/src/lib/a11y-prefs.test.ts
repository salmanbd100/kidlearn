import { beforeEach, describe, expect, it } from "vitest";
import {
  A11Y_BOOTSTRAP_SCRIPT,
  A11Y_STORAGE_KEY,
  applyA11yPrefs,
  DEFAULT_A11Y_PREFS,
  readA11yPrefs,
  setA11yPref,
} from "./a11y-prefs";

describe("a11y preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
  });

  it("defaults every preference to off", () => {
    expect(readA11yPrefs()).toEqual({
      highContrast: false,
      dyslexiaFont: false,
      reducedMotion: false,
    });
  });

  it("stores a preference and mirrors it onto <html>", () => {
    setA11yPref("highContrast", true);

    expect(readA11yPrefs().highContrast).toBe(true);
    expect(document.documentElement).toHaveClass("high-contrast");
  });

  it("removes the class when a preference is turned back off", () => {
    setA11yPref("dyslexiaFont", true);
    setA11yPref("dyslexiaFont", false);

    expect(document.documentElement).not.toHaveClass("dyslexia-font");
  });

  it("ignores a corrupt stored value rather than throwing", () => {
    window.localStorage.setItem(A11Y_STORAGE_KEY, "not json");

    expect(readA11yPrefs()).toEqual(DEFAULT_A11Y_PREFS);
  });

  it("ignores stored keys that are not booleans", () => {
    window.localStorage.setItem(
      A11Y_STORAGE_KEY,
      JSON.stringify({ highContrast: "yes", reducedMotion: true }),
    );

    expect(readA11yPrefs()).toEqual({
      highContrast: false,
      dyslexiaFont: false,
      reducedMotion: true,
    });
  });

  it("applies the same classes pre-paint as the runtime helper does", () => {
    setA11yPref("reducedMotion", true);
    document.documentElement.className = "";

    // Exactly what the root layout injects into <body> before React runs.
    new Function(A11Y_BOOTSTRAP_SCRIPT)();

    const fromScript = document.documentElement.className;
    document.documentElement.className = "";
    applyA11yPrefs(readA11yPrefs());

    expect(document.documentElement.className).toBe(fromScript);
    expect(fromScript).toContain("reduced-motion");
  });
});
