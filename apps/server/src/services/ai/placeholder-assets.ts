/**
 * The placeholder every generated asset reference carries until file 36 records
 * the real thing.
 *
 * Extracted from `generators/lesson.ts` by file 35 when the quiz generator needed
 * the same rewriting: two generators writing `QuizQuestion.definition` must agree
 * on what an unattached asset looks like, because file 37 refuses to approve a
 * question that still holds one and can only look for a single spelling.
 *
 * A reserved `.invalid` host (RFC 2606) rather than a `pending://` scheme, which
 * is what implementation files 05 and 35 first described. Two reasons, and the
 * first is decisive: `AssetRefSchema.url` requires `https://` (file 07 — no mixed
 * content reaches a child's device), so a `pending://` URL cannot be stored in a
 * quiz payload at all. It would fail the very contract the row is validated
 * against. Second, `.invalid` is guaranteed never to resolve, so a placeholder
 * that somehow survived review fails loudly on first play instead of fetching
 * whatever now lives at a plausible-looking CDN path a model invented.
 */

export const PLACEHOLDER_ASSET_HOST = "https://placeholder.kidlearn.invalid";

/**
 * Rewrites every asset URL in a generated payload onto the reserved host.
 *
 * The model is told to use that host, and this does not trust it to. A generated
 * URL that pointed at a real CDN would be a third-party address inside a row a
 * lesson later plays, and it would look plausible enough to survive a review that
 * was reading the words rather than the links. The path is kept, so file 36 can
 * still see what each clip or picture was meant to be.
 *
 * Takes and returns `unknown` rather than being generic: the value is rebuilt key
 * by key, so a `T` in and a `T` out would be an assertion no branch here checks.
 * Callers re-parse the result against the shared union, which is what makes the
 * shape true rather than declared.
 */
export function withPlaceholderAssets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => withPlaceholderAssets(item));
  }
  if (!isRecord(value)) return value;

  const entries = Object.entries(value).map(([key, child]) =>
    key === "url" && typeof child === "string"
      ? [key, toPlaceholderUrl(child)]
      : [key, withPlaceholderAssets(child)],
  );
  return Object.fromEntries(entries);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toPlaceholderUrl(url: string): string {
  try {
    return `${PLACEHOLDER_ASSET_HOST}${new URL(url).pathname}`;
  } catch {
    // Unreachable through the schema, which rejects a non-URL — but a fallback
    // that produced something invalid would turn a bad link into a failed job.
    return `${PLACEHOLDER_ASSET_HOST}/asset`;
  }
}
