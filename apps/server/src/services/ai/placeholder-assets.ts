/**
 * The placeholder every generated asset reference carries until file 36 records
 * the real thing.
 */

export const PLACEHOLDER_ASSET_HOST = "https://placeholder.kidlearn.invalid";

/** Rewrites every asset URL in a generated payload onto the reserved host. */
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
