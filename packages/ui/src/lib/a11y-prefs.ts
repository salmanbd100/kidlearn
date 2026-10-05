// The three accessibility preferences a user can turn on (NFR-A11Y-03..05).

export const A11Y_STORAGE_KEY = "kidlearn_a11y";

export const A11Y_PREF_CLASSES = {
  highContrast: "high-contrast",
  dyslexiaFont: "dyslexia-font",
  reducedMotion: "reduced-motion",
} as const;

export type A11yPrefKey = keyof typeof A11Y_PREF_CLASSES;

export type A11yPrefs = Record<A11yPrefKey, boolean>;

// `Object.keys` is typed `string[]`; this `as const` literal has no extra keys.
export const A11Y_PREF_KEYS = Object.keys(A11Y_PREF_CLASSES) as A11yPrefKey[];

export const DEFAULT_A11Y_PREFS: A11yPrefs = {
  highContrast: false,
  dyslexiaFont: false,
  reducedMotion: false,
};

export function readA11yPrefs(): A11yPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_A11Y_PREFS };

  try {
    const raw = window.localStorage.getItem(A11Y_STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_A11Y_PREFS };
    // localStorage is user-writable: narrow the parsed value key by key, do not trust it as A11yPrefs.
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_A11Y_PREFS };
    }
    const record = parsed as Record<string, unknown>;
    const prefs = { ...DEFAULT_A11Y_PREFS };
    for (const key of A11Y_PREF_KEYS) {
      if (typeof record[key] === "boolean") prefs[key] = record[key];
    }
    return prefs;
  } catch {
    return { ...DEFAULT_A11Y_PREFS };
  }
}

export function writeA11yPrefs(prefs: A11yPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private-browsing quota errors must not break the settings UI.
  }
}

export function applyA11yPrefs(
  prefs: A11yPrefs,
  root: HTMLElement | undefined = typeof document === "undefined"
    ? undefined
    : document.documentElement,
): void {
  if (root === undefined) return;
  for (const key of A11Y_PREF_KEYS) {
    root.classList.toggle(A11Y_PREF_CLASSES[key], prefs[key]);
  }
}

export function setA11yPref(key: A11yPrefKey, isEnabled: boolean): A11yPrefs {
  const prefs = { ...readA11yPrefs(), [key]: isEnabled };
  writeA11yPrefs(prefs);
  applyA11yPrefs(prefs);
  return prefs;
}

/** Runs in `<head>` before first paint, so it is dependency-free and duplicated: a flash of un-themed UI is worse. */
export const A11Y_BOOTSTRAP_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  A11Y_STORAGE_KEY,
)})||"{}");var m=${JSON.stringify(A11Y_PREF_CLASSES)};for(var k in m){if(p[k]===true){document.documentElement.classList.add(m[k]);}}}catch(e){}})();`;
