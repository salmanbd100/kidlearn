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
import type { ApiFailure } from "@/lib/api-client";
import { fetchAuthMe, listChildren } from "@/lib/parent-api";

/**
 * Everything the `(parent)` route group knows about the visitor, loaded once.
 */

export type ParentSessionStatus = "loading" | "ready" | "signedOut" | "error";

type ParentSessionValue = {
  status: ParentSessionStatus;
  parent: ParentSummaryResponse | undefined;
  /** Oldest first, as the API returns them. `undefined` until loaded. */
  children: ChildProfileResponse[] | undefined;
  error: ApiFailure | undefined;
  /** Re-reads the parent and their profiles — after consent, or a write. */
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

  // Guards against a response from an unmounted provider writing state, and
  // against a slow first load overwriting a faster refresh.
  const loadId = useRef(0);

  const load = useCallback(async () => {
    loadId.current += 1;
    const id = loadId.current;

    // In parallel: both routes need only `requireParent`, so neither depends on
    // the other having run first, and the parent row is provisioned by
    // whichever arrives at the server first.
    const [me, list] = await Promise.all([fetchAuthMe(), listChildren()]);

    if (id !== loadId.current) return;

    if (!me.ok) {
      // A 401 is the ordinary signed-out case, not a failure to report.
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

    setParent(me.data.parent);
    setError(undefined);
    setProfiles(list.ok ? list.data : undefined);

    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
    return () => {
      // Any in-flight response now belongs to a previous generation.
      loadId.current += 1;
    };
  }, [load]);

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
