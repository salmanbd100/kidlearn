/** JSONB columns and parsed request bodies arrive as `unknown`-shaped JSON; every field is re-checked on read. */
export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  // JSON boundary: the guards above verify "an object with unknown values".
  return value as Record<string, unknown>;
}

export function readString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}
