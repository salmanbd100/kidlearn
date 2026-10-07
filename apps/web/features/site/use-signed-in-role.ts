"use client";

import { useEffect, useState } from "react";
import { fetchAdminMe } from "@/features/admin/admin-api";
import { fetchAuthMe } from "@/features/parent/parent-api";

/** `unknown` until the probe settles, and for good if the API cannot be reached. */
export type SignedInRole = "unknown" | "signedOut" | "parent" | "admin";

/**
 * Who, if anyone, the session cookie belongs to. Parent first, as parents are most visitors; the
 * server refuses an admin a parent row with a `403`, which is the cue to ask the admin endpoint.
 */
export function useSignedInRole(): SignedInRole {
  const [role, setRole] = useState<SignedInRole>("unknown");

  useEffect(() => {
    let isCurrent = true;

    async function probe(): Promise<SignedInRole> {
      const parent = await fetchAuthMe();
      if (parent.ok) return "parent";
      if (parent.error.status === 401) return "signedOut";
      if (parent.error.status !== 403) return "unknown";

      const admin = await fetchAdminMe();
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
