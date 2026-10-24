"use client";

import { Analytics } from "@vercel/analytics/next";
import { redactAnalyticsUrl } from "@/shared/lib/analytics";

// A client boundary of its own: `beforeSend` is a function, which the server root layout cannot pass as a prop.
export function WebAnalytics() {
  return <Analytics beforeSend={redactAnalyticsUrl} />;
}
