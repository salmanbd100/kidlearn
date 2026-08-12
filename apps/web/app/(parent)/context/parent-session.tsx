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
 *
 * ## Why this fetches in the browser
 *
 * `frontend.md §2` says never fetch in a Client Component. This is the documented
 * exception, and it is forced rather than chosen: the better-auth session cookie
 * is set on the **API origin** and is `httpOnly`. A Server Component calling
 * `/api/auth/me` would send no cookie and get a `401` — the Next server never
 * receives that cookie at all, so there is no server-side path to the parent's
 * identity. Every request therefore goes out from the browser with
 * `credentials: "include"`, which is what `apiFetch` already does.
 *
 * The consequence is contained deliberately: this is the *only* place in
 * `(parent)` that loads session data. Pages read it from context, so no screen
 * fetches its own copy and no screen can disagree with another about who is
 * signed in or how many children exist.
 *
 * ## Why the gate is a second context
 *
 * `useParentSession` answers "who is this and what do they have"; `useParentGate`
 * answers "may the parent area be shown right now". A component that renders a
 * child's name does not want to re-render when the gate locks, and the PIN modal
 * does not care how many children there are.
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
   *
   * The expiry timer handles the ordinary case, but it cannot handle every case:
   * the server is the authority on the grant, and a client clock that drifted, a
   * tab that slept through its own `setTimeout`, or a sign-out on another device
   * all end with a live-looking gate in front of an expired one. `403
   * PIN_VERIFICATION_REQUIRED` is the server saying so, and the only correct
   * response is the PIN pad rather than an error the parent cannot act on.
   *
   * Every caller of a PIN-gated endpoint should wrap it in this. The result is
   * passed through untouched, so it composes with the existing error mapping.
   */
  guard: <T>(call: Promise<ApiResult<T>>) => Promise<ApiResult<T>>;
};

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
    // `hasPin` from `/api/auth/me` is enough to decide that, and it arrived on a
    // request that did succeed.
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

    const msRemaining = new Date(grantExpiresAt).getTime() - Date.now();
    if (msRemaining <= 0) {
      setIsLocked(true);
      setGrantExpiresAt(null);
      return;
    }

    const timer = setTimeout(() => {
      setIsLocked(true);
      setGrantExpiresAt(null);
    }, msRemaining);
    return () => clearTimeout(timer);
  }, [grantExpiresAt]);

  const sessionValue = useMemo<ParentSessionValue>(
    () => ({ status, parent, children: profiles, error, refresh: load }),
    [status, parent, profiles, error, load],
  );

  const gateValue = useMemo<ParentGateValue>(() => {
    const relock = () => {
      setIsLocked(true);
      setGrantExpiresAt(null);
    };

    return {
      isLocked,
      unlock: (pinVerifiedUntil: string) => {
        setIsLocked(false);
        setGrantExpiresAt(pinVerifiedUntil);
      },
      relock,
      guard: async <T,>(call: Promise<ApiResult<T>>) => {
        const result = await call;
        if (!result.ok && result.error.code === "PIN_VERIFICATION_REQUIRED") {
          relock();
        }
        return result;
      },
    };
  }, [isLocked]);

  return (
    <ParentSessionContext.Provider value={sessionValue}>
      <ParentGateContext.Provider value={gateValue}>
        {children}
      </ParentGateContext.Provider>
    </ParentSessionContext.Provider>
  );
}
