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
import type { ApiFailure, ApiResult } from "@/lib/api-client";
import { fetchAuthMe, fetchGateStatus, listChildren } from "@/lib/parent-api";

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
  /** Re-reads the parent and their profiles — after consent, a PIN, a write. */
  refresh: () => Promise<void>;
};

type ParentGateValue = {
  /** True while a PIN exists and this session has no live grant. */
  isLocked: boolean;
  /** Called after a successful verify, and by the grant-expiry timer. */
  unlock: (pinVerifiedUntil: string) => void;
  /**
   * Shut the gate again. Prefer `guard` below, which calls this for you — reach
   * for `relock` directly only where there is no single call to wrap.
   */
  relock: () => void;
  /**
   * Runs a PIN-gated call, shutting the gate if the grant turns out to have
   * lapsed.
   */
  guard: <T>(call: Promise<ApiResult<T>>) => Promise<ApiResult<T>>;
};

/** The largest delay `setTimeout` honours; anything above it is clamped to 1ms. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const ParentSessionContext = createContext<ParentSessionValue | undefined>(
  undefined,
);
const ParentGateContext = createContext<ParentGateValue | undefined>(undefined);

export function useParentSession(): ParentSessionValue {
  const value = useContext(ParentSessionContext);
  if (!value) {
    throw new Error(
      "useParentSession must be used inside ParentSessionProvider",
    );
  }
  return value;
}

export function useParentGate(): ParentGateValue {
  const value = useContext(ParentGateContext);
  if (!value) {
    throw new Error("useParentGate must be used inside ParentSessionProvider");
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
  const [isLocked, setIsLocked] = useState(false);
  const [grantExpiresAt, setGrantExpiresAt] = useState<string | null>(null);

  // Guards against a response from an unmounted provider writing state, and
  // against a slow first load overwriting a faster refresh.
  const loadId = useRef(0);

  const load = useCallback(async () => {
    loadId.current += 1;
    const id = loadId.current;

    // In parallel: all three routes need only `requireParent`, so none of them
    // depends on another having run first, and the parent row is provisioned by
    // whichever arrives at the server first.
    const [me, list, gate] = await Promise.all([
      fetchAuthMe(),
      listChildren(),
      fetchGateStatus(),
    ]);

    if (id !== loadId.current) return;

    if (!me.ok) {
      // A 401 is the ordinary signed-out case, not a failure to report.
      if (me.error.code === "UNAUTHORIZED") {
        setParent(undefined);
        setProfiles(undefined);
        setIsLocked(false);
        setGrantExpiresAt(null);
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

    // Fail **closed**. A gate whose state could not be read is a shut gate: the
    // alternative leaves `isLocked` at its initial `false`, so one failed request
    // renders the whole parent area unlocked — a network blip becoming a bypass.
    if (gate.ok) {
      setIsLocked(gate.data.hasPin && !gate.data.isPinVerified);
      setGrantExpiresAt(gate.data.pinVerifiedUntil);
    } else {
      setIsLocked(me.data.parent.hasPin);
      setGrantExpiresAt(null);
    }

    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
    return () => {
      // Any in-flight response now belongs to a previous generation.
      loadId.current += 1;
    };
  }, [load]);

  /**
   * Shuts the gate the moment the grant lapses, rather than waiting for the next
   * PIN-gated request to fail. A parent who walked away mid-session comes back to
   * the PIN pad, which is the point of a 15-minute grant.
   */
  useEffect(() => {
    if (grantExpiresAt === null) return;

    const expiresAt = new Date(grantExpiresAt).getTime();

    const lapse = () => {
      setIsLocked(true);
      setGrantExpiresAt(null);
    };

    // Fail **closed**, as everywhere else on this gate: an expiry the client
    // cannot read is a grant it cannot vouch for.
    if (Number.isNaN(expiresAt)) {
      lapse();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const arm = () => {
      const msRemaining = expiresAt - Date.now();
      if (msRemaining <= 0) {
        lapse();
        return;
      }
      // `setTimeout` clamps any delay above 2**31-1 ms to **1ms** rather than
      // rejecting it, so passing `msRemaining` straight through relocked the
      // gate almost immediately for any grant more than ~24.8 days out — the
      // exact opposite of what the delay asked for. Sleep in ceiling-sized
      // chunks and re-check the real clock each time.
      timer = setTimeout(arm, Math.min(msRemaining, MAX_TIMEOUT_MS));
    };

    arm();
    return () => clearTimeout(timer);
  }, [grantExpiresAt]);

  const sessionValue = useMemo<ParentSessionValue>(
    () => ({ status, parent, children: profiles, error, refresh: load }),
    [status, parent, profiles, error, load],
  );

  /** The three gate actions are stable across a lock/unlock, and must be. */
  const relock = useCallback(() => {
    setIsLocked(true);
    setGrantExpiresAt(null);
  }, []);

  const unlock = useCallback((pinVerifiedUntil: string) => {
    setIsLocked(false);
    setGrantExpiresAt(pinVerifiedUntil);
  }, []);

  const guard = useCallback(
    async <T,>(call: Promise<ApiResult<T>>) => {
      const result = await call;
      if (!result.ok && result.error.code === "PIN_VERIFICATION_REQUIRED") {
        relock();
      }
      return result;
    },
    [relock],
  );

  const gateValue = useMemo<ParentGateValue>(
    () => ({ isLocked, unlock, relock, guard }),
    [isLocked, unlock, relock, guard],
  );

  return (
    <ParentSessionContext.Provider value={sessionValue}>
      <ParentGateContext.Provider value={gateValue}>
        {children}
      </ParentGateContext.Provider>
    </ParentSessionContext.Provider>
  );
}
