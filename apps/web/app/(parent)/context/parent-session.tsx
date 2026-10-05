"use client";

import type {
  ChildProfileResponse,
  ParentSummaryResponse,
} from "@kidlearn/types";
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
import { fetchAuthMe, listChildren } from "@/features/parent/parent-api";
import { type ApiFailure, onUnauthorized } from "@/shared/api/api-client";

export type ParentSessionStatus = "loading" | "ready" | "signedOut" | "error";

type ParentSessionValue = {
  status: ParentSessionStatus;
  parent: ParentSummaryResponse | undefined;
  /** Oldest first, as the API returns them. `undefined` until loaded. */
  children: ChildProfileResponse[] | undefined;
  error: ApiFailure | undefined;
  refresh: () => Promise<void>;
};

const ParentSessionContext = createContext<ParentSessionValue | undefined>(
  undefined,
);

export function useParentSession(): ParentSessionValue {
  const value = useContext(ParentSessionContext);
  if (!value) {
    throw new Error(
      "useParentSession must be used inside ParentSessionProvider",
    );
  }
  return value;
}

export function ParentSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ParentSessionStatus>("loading");
  const [parent, setParent] = useState<ParentSummaryResponse | undefined>();
  const [profiles, setProfiles] = useState<
    ChildProfileResponse[] | undefined
  >();
  const [error, setError] = useState<ApiFailure | undefined>();

  // Guards against an unmounted provider writing state and a slow first load overwriting a faster refresh.
  const loadId = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;
  const isLoadingRef = useRef(false);

  const load = useCallback(async () => {
    loadId.current += 1;
    const id = loadId.current;
    isLoadingRef.current = true;

    // In parallel: both need only `requireParent`, and whichever arrives first provisions the parent row.
    const [me, list] = await Promise.all([fetchAuthMe(), listChildren()]);

    if (id !== loadId.current) return;
    isLoadingRef.current = false;

    if (!me.ok) {
      if (me.error.code === "UNAUTHORIZED") {
        setParent(undefined);
        setProfiles(undefined);
        setError(undefined);
        setStatus("signedOut");
        return;
      }
      setError(me.error);
      setStatus("error");
      return;
    }

    if (!list.ok) {
      // Not `ready` with an unknown list: the guard would let every page through and skip the onboarding redirect.
      if (list.error.code === "UNAUTHORIZED") {
        setParent(undefined);
        setProfiles(undefined);
        setError(undefined);
        setStatus("signedOut");
        return;
      }
      setError(list.error);
      setStatus("error");
      return;
    }

    setParent(me.data.parent);
    setError(undefined);
    setProfiles(list.data);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
    return () => {
      // Any in-flight response now belongs to a previous generation.
      loadId.current += 1;
    };
  }, [load]);

  // A later 401 means the session may be gone; `/auth/me` answering 401 flips to `signedOut`. Only while
  // `ready` and idle, or the load's own 401s would re-trigger it.
  useEffect(
    () =>
      onUnauthorized(() => {
        if (statusRef.current === "ready" && !isLoadingRef.current) {
          void load();
        }
      }),
    [load],
  );

  const sessionValue = useMemo<ParentSessionValue>(
    () => ({ status, parent, children: profiles, error, refresh: load }),
    [status, parent, profiles, error, load],
  );

  return (
    <ParentSessionContext.Provider value={sessionValue}>
      {children}
    </ParentSessionContext.Provider>
  );
}
