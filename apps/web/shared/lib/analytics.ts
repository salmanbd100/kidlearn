import type { BeforeSendEvent } from "@vercel/analytics/next";

const CHILD_PROFILE_PATH = /^\/parent\/children\/[^/]+/;

/**
 * NFR-SAFE-04: no child identifier may reach a third party. Dashboard URLs carry one in
 * `?child=<id>` and in `/parent/children/<id>`, so the query and fragment are dropped outright
 * and that segment is replaced by its route pattern.
 */
export function redactAnalyticsUrl(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(
    CHILD_PROFILE_PATH,
    "/parent/children/[id]",
  );
  return { ...event, url: url.toString() };
}
