"use client";

import type {
  AvatarCharacterResponse,
  ChildProfileResponse,
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

/**
 * Who is playing, for the whole `(student)` route group.
 *
 * ## Why this fetches in the browser
 *
 * The same forced exception `(parent)/context/parent-session.tsx` documents: the
 * better-auth session cookie is `httpOnly` and set on the **API origin**, so a
 * Server Component asking who is signed in would send no cookie and get a `401`.
 * Every request therefore goes out from the browser, and it is contained the same
 * way — this is the only place in `(student)` that loads session data, so no two
 * screens can disagree about who is playing.
 *
 * ## Why the profile list lives here too
 *
 * `/select-profile` needs every profile, `/home` needs one of them, and the
 * avatar art for both is resolved from the same character list. Loading all three
 * once and picking from them means switching profiles is a `POST` and a state
 * change rather than three more round trips — which is the difference between an
 * instant switch and a child watching a spinner.
 *
 * ## What it does not do
 *
 * Nothing here computes a reward, a streak, or a screen-time budget. `stats`
 * arrives on the profile from the server and is rendered as given; the client
 * never writes to it (FR-GAM-06, spec §7 — progress is server-authoritative).
 */

export type ActiveChildStatus = "loading" | "ready" | "signedOut" | "error";

export interface ActiveChildValue {
  status: ActiveChildStatus;
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
      setStatus(me.error.code === "UNAUTHORIZED" ? "signedOut" : "error");
      return;
    }

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

  /**
   * FR-I18N-02 — the child's own language wins over the device cookie.
   *
   * Driven by the active profile rather than by the tap that activated it, so a
   * reload lands in the right language too: the session already remembers who is
   * playing, and their preference has to survive that. `changeLanguage` writes the
   * cookie through i18next's detector, so the next first paint is already correct.
   */
  const language = child?.preferredLanguage;
  useEffect(() => {
    if (language !== undefined && i18n.resolvedLanguage !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  const value = useMemo<ActiveChildValue>(
    () => ({
      status,
      profiles,
      avatars,
      child,
      isWakingUp,
      activate,
      refresh: load,
    }),
    [status, profiles, avatars, child, isWakingUp, activate, load],
  );

  return (
    <ActiveChildContext.Provider value={value}>
      {children}
    </ActiveChildContext.Provider>
  );
}
