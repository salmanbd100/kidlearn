export const CONTENT_BASE = "/api/admin/content";

export type ListOptions = { includeArchived?: boolean };

export function listQuery(
  options: ListOptions & Record<string, string | number | boolean | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === false) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
