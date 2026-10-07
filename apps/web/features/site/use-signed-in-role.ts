"use client";

import { useEffect, useState } from "react";
import { fetchAdminMe } from "@/features/admin/admin-api";
import { fetchAuthMe } from "@/features/parent/parent-api";

/** `unknown` until the probe settles, and for good if the API cannot be reached. */
export type SignedInRole = "unknown" | "signedOut" | "parent" | "admin";

// One quick try: `unknown` already renders the signed-out actions, so retrying a cold API for a minute
// would only keep a signed-in visitor looking at "Sign in" for that minute.
const PROBE = { retries: 0, timeoutMs: 5000 } as const;

/**
 * Who, if anyone, the session cookie belongs to. Parent first, as parents are most visitors; the
 * server refuses an admin a parent row with a `403`, which is the cue to ask the admin endpoint.
 */
export function useSignedInRole(): SignedInRole {
  const [role, setRole] = useState<SignedInRole>("unknown");

  useEffect(() => {
    let isCurrent = true;

    async function probe(): Promise<SignedInRole> {
      const parent = await fetchAuthMe(PROBE);
      if (parent.ok) return "parent";
      if (parent.error.status === 401) return "signedOut";
      if (parent.error.status !== 403) return "unknown";

      const admin = await fetchAdminMe(PROBE);
      if (admin.ok) return "admin";
      return admin.error.status === 401 || admin.error.status === 403
        ? "signedOut"
        : "unknown";
    }

    void probe().then((settled) => {
      if (isCurrent) setRole(settled);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  return role;
}
