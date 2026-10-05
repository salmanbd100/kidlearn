import { describe, expect, it } from "vitest";
import { resources } from "./index";

// A missing Bangla string falls back to English silently, so nothing else
// would notice one until a Bangla-speaking child heard English.

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const found = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") {
      found.set(path, value);
    } else {
      for (const [inner, text] of leaves(value, path)) found.set(inner, text);
    }
  }
  return found;
}

/** `{{name}}` placeholders must survive translation; `count` is exempt (a `_one` form may spell "1" out). */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)]
    .map((match) => match[1])
    .filter((name) => name !== "count")
    .sort();
}

// `Object.keys` is typed `string[]`; `resources` has no keys beyond its type's.
const namespaces = Object.keys(resources.en) as (keyof typeof resources.en)[];

describe("en/bn parity", () => {
  it("ships the same namespaces in both locales", () => {
    expect(Object.keys(resources.bn).sort()).toEqual([...namespaces].sort());
  });

  describe.each(namespaces)("%s", (namespace) => {
    // Each JSON's inferred type is an exact literal; `Tree` is their common shape.
    const en = leaves(resources.en[namespace] as Tree);
    const bn = leaves(resources.bn[namespace] as Tree);

    it("has every English key in Bangla", () => {
      expect([...en.keys()].filter((key) => !bn.has(key))).toEqual([]);
    });

    it("has no Bangla key that English lacks", () => {
      expect([...bn.keys()].filter((key) => !en.has(key))).toEqual([]);
    });

    it("has no blank Bangla string", () => {
      expect([...bn].filter(([, text]) => text.trim() === "")).toEqual([]);
    });

    it("keeps every interpolation placeholder", () => {
      const mismatched = [...en]
        .filter(([key]) => bn.has(key))
        .filter(
          ([key, text]) =>
            placeholders(text).join() !==
            placeholders(bn.get(key) ?? "").join(),
        )
        .map(([key]) => key);
      expect(mismatched).toEqual([]);
    });
  });
});
