"use client";

import type { AdminIdentity } from "@kidlearn/types";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { adminSignOut, fetchAdminMe } from "@/lib/admin-api";

/**
 * Who is signed in to the CMS, loaded once (file 31, FR-CMS-01).
 *
 * **Fetches in the browser, like `(parent)` does, and for the same forced
 * reason:** the better-auth session cookie is set on the API origin and is
 * `httpOnly`, so a Server Component calling `/api/admin/me` would send no cookie
 * and get a `401`. There is no server-side path to the admin's identity. The
 * exception to `frontend.md §2` is contained the same way — this is the only place
 * in `(admin)` that loads session data, so `AdminGuard` and the sidebar footer
 * cannot disagree about who is signed in.
 *
 * There is no gate context to match `useParentGate`: the PIN protects a parent's
 * dashboard from the child holding the tablet, and nobody is handing an admin's
 * laptop to a five-year-old.
 */

export type AdminSessionStatus = "loading" | "ready" | "signedOut" | "error";

type AdminSessionValue = {
  status: AdminSessionStatus;
  admin: AdminIdentity | undefined;
  /**
   * Re-reads `/api/admin/me`. Called by the login screen after a successful
   * sign-in: this provider mounted on the login page and resolved `signedOut`, so
   * without a re-read the guard would bounce the new session straight back.
   */
  refresh: () => Promise<void>;
  /** Revokes the session and drops the identity, so the guard bounces to login. */
  signOut: () => Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionValue | undefined>(
  undefined,
);

export function useAdminSession(): AdminSessionValue {
  const value = useContext(AdminSessionContext);
  if (!value) {
    throw new Error("useAdminSession must be used inside AdminSessionProvider");
  }
  return value;
}

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminSessionStatus>("loading");
  const [admin, setAdmin] = useState<AdminIdentity | undefined>();

  const refresh = useCallback(async () => {
    const result = await fetchAdminMe();
    if (result.ok) {
      setAdmin(result.data);
      setStatus("ready");
      return;
    }
    // 401 is no session; 403 is a signed-in parent who wandered in. Both mean "not
    // an admin here", and both belong at the login screen rather than on an error
    // page — a parent who followed a stale link should not be told the CMS is
    // broken.
    setAdmin(undefined);
    setStatus(
      result.error.status === 401 || result.error.status === 403
        ? "signedOut"
        : "error",
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await adminSignOut();
    setAdmin(undefined);
    setStatus("signedOut");
  }, []);

  const value = useMemo<AdminSessionValue>(
    () => ({ status, admin, refresh, signOut }),
    [status, admin, refresh, signOut],
  );

  return (
    <AdminSessionContext.Provider value={value}>
      {children}
    </AdminSessionContext.Provider>
  );
}
