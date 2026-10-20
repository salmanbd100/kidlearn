import type { ZodIssue } from "zod";

export type IssueMap = {
  /** The message for exactly this path, if any. */
  at: (path: (string | number)[]) => string | undefined;
  /** The message for this path *or anything under it* — for a fieldset heading. */
  under: (path: (string | number)[]) => string | undefined;
  /** Everything that did not land on a field the form renders. */
  unplaced: string[];
  hasAny: boolean;
};

const key = (path: (string | number)[]): string => path.join(".");

/** `knownPaths` makes `unplaced` meaningful: issues on paths no input owns (e.g. `correctPairs`) are surfaced together, not dropped. */
export function toIssueMap(
  issues: readonly ZodIssue[],
  knownPaths: readonly string[] = [],
): IssueMap {
  const byPath = new Map<string, string>();
  const known = new Set(knownPaths);

  for (const issue of issues) {
    const path = key(issue.path);
    // First issue wins; concatenating produces a line no author can read.
    if (!byPath.has(path)) byPath.set(path, issue.message);
  }

  const unplaced = [...byPath.entries()]
    .filter(([path]) => !known.has(path))
    .map(([path, message]) => (path === "" ? message : `${path}: ${message}`));

  return {
    at: (path) => byPath.get(key(path)),
    under: (path) => {
      const prefix = key(path);
      for (const [candidate, message] of byPath) {
        if (candidate === prefix || candidate.startsWith(`${prefix}.`)) {
          return message;
        }
      }
      return undefined;
    },
    unplaced,
    hasAny: byPath.size > 0,
  };
}
