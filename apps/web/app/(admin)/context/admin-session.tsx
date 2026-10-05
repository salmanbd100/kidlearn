"use client";

import type { AdminIdentity } from "@kidlearn/types";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { adminSignOut, fetchAdminMe } from "@/features/admin/admin-api";
import { onUnauthorized } from "@/shared/api/api-client";

export type AdminSessionStatus = "loading" | "ready" | "signedOut" | "error";

type AdminSessionValue = {
  status: AdminSessionStatus;
  admin: AdminIdentity | undefined;
  /** Re-reads `/api/admin/me`; the login screen calls it because this provider resolved `signedOut` on mount. */
  refresh: () => Promise<void>;
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
  const statusRef = useRef(status);
  statusRef.current = status;
  const isLoadingRef = useRef(false);

  const refresh = useCallback(async () => {
    isLoadingRef.current = true;
    const result = await fetchAdminMe().finally(() => {
      isLoadingRef.current = false;
    });
    if (result.ok) {
      setAdmin(result.data);
      setStatus("ready");
      return;
    }
    // 401 (no session) and 403 (a parent who wandered in) both belong at login, not an error page.
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

  // A later 401 means the session may be gone; re-read `/api/admin/me`. Only while `ready` and
  // idle, or `refresh`'s own 401 would re-trigger it.
  useEffect(
    () =>
      onUnauthorized(() => {
        if (statusRef.current === "ready" && !isLoadingRef.current) {
          void refresh();
        }
      }),
    [refresh],
  );

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
