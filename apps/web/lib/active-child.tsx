"use client";

import type {
  AvatarCharacterResponse,
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
import { useTranslation } from "react-i18next";
import type { ApiResult } from "./api-client";
import {
  activateChild,
  fetchAuthMe,
  listAvatars,
  listChildren,
} from "./parent-api";

// Who is playing, for the whole `(student)` route group.

export type ActiveChildStatus = "loading" | "ready" | "signedOut" | "error";

export interface ActiveChildValue {
  status: ActiveChildStatus;
  /**
   * The grown-up who owns this device, for the parent chip on `/select-profile`.
   * `undefined` until the session loads, and while signed out.
   */
  parent: ParentSummaryResponse | undefined;
  /** Every profile the signed-in parent owns, oldest first. */
  profiles: ChildProfileResponse[];
  /** Starter characters, for resolving a profile's avatar art. */
  avatars: AvatarCharacterResponse[];
  /** The profile the session is scoped to, or `undefined` before one is picked. */
  child: ChildProfileResponse | undefined;
  /** True once a request has been retried — the API is asleep (NFR-PERF-04). */
  isWakingUp: boolean;
  /** FR-AUTH-06 — scopes the session to a child. No PIN, by design. */
  activate: (
    childId: string,
  ) => Promise<ApiResult<{ activeChildProfileId: string }>>;
  refresh: () => Promise<void>;
}

const ActiveChildContext = createContext<ActiveChildValue | undefined>(
  undefined,
);

export function useActiveChild(): ActiveChildValue {
  const value = useContext(ActiveChildContext);
  if (value === undefined) {
    throw new Error(
      "useActiveChild must be used inside an ActiveChildProvider",
    );
  }
  return value;
}

export function ActiveChildProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [status, setStatus] = useState<ActiveChildStatus>("loading");
  const [parent, setParent] = useState<ParentSummaryResponse | undefined>();
  const [profiles, setProfiles] = useState<ChildProfileResponse[]>([]);
  const [avatars, setAvatars] = useState<AvatarCharacterResponse[]>([]);
  const [activeChildId, setActiveChildId] = useState<string | undefined>();
  const [isWakingUp, setIsWakingUp] = useState(false);

  // Guards against a response from an unmounted provider writing state, and
  // against a slow first load overwriting a faster refresh.
  const loadId = useRef(0);

  const load = useCallback(async () => {
    loadId.current += 1;
    const id = loadId.current;

    // In parallel: all three need only `requireParent`, so none waits on another.
    const [me, list, characters] = await Promise.all([
      fetchAuthMe(),
      listChildren({ onColdStart: () => setIsWakingUp(true) }),
      listAvatars(),
    ]);

    if (id !== loadId.current) return;
    setIsWakingUp(false);

    if (!me.ok) {
      // A 401 is the ordinary signed-out case, not a failure to report: the
      // grown-up has to sign in before anyone can play.
      setParent(undefined);
      setStatus(me.error.code === "UNAUTHORIZED" ? "signedOut" : "error");
      return;
    }

    setParent(me.data.parent);

    if (!list.ok) {
      // Unlike the parent dashboard, this list *is* the screen — there is no
      // useful student surface without it.
      setStatus("error");
      return;
    }

    setProfiles(list.data);
    setAvatars(characters.ok ? characters.data : []);
    setActiveChildId(me.data.activeChildProfileId ?? undefined);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
    return () => {
      // Any in-flight response now belongs to a previous generation.
      loadId.current += 1;
    };
  }, [load]);

  const activate = useCallback(async (childId: string) => {
    const result = await activateChild(childId);
    if (result.ok) setActiveChildId(result.data.activeChildProfileId);
    return result;
  }, []);

  const child = useMemo(
    () =>
      activeChildId === undefined
        ? undefined
        : profiles.find((profile) => profile.id === activeChildId),
    [profiles, activeChildId],
  );

  /** FR-I18N-02 — the child's own language wins over the device cookie. */
  const language = child?.preferredLanguage;
  useEffect(() => {
    if (language !== undefined && i18n.resolvedLanguage !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  const value = useMemo<ActiveChildValue>(
    () => ({
      status,
      parent,
      profiles,
      avatars,
      child,
      isWakingUp,
      activate,
      refresh: load,
    }),
    [status, parent, profiles, avatars, child, isWakingUp, activate, load],
  );

  return (
    <ActiveChildContext.Provider value={value}>
      {children}
    </ActiveChildContext.Provider>
  );
}
