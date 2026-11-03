"use client";

import type { AiCapabilities } from "@kidlearn/types";
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
import { fetchAiCapabilities } from "@/features/admin/api/ai-api";

type AiCapabilitiesValue = {
  capabilities: AiCapabilities | undefined;
  hasFailed: boolean;
  retry: () => void;
};

const OUTSIDE_PROVIDER: AiCapabilitiesValue = {
  capabilities: undefined,
  hasFailed: false,
  retry: () => {},
};

const AiCapabilitiesContext =
  createContext<AiCapabilitiesValue>(OUTSIDE_PROVIDER);

/**
 * `undefined` until known, if the read failed, and outside the provider. Callers hide a Gemini button only on
 * an explicit `false`: while loading, or if the read fails, the button stays and the route's own 503 explains itself.
 */
export function useAiCapabilities(): AiCapabilities | undefined {
  return useContext(AiCapabilitiesContext).capabilities;
}

/** For a page that is about capabilities and so cannot fail open: it needs to tell a failed read from a slow one. */
export function useAiCapabilitiesLoad(): AiCapabilitiesValue {
  return useContext(AiCapabilitiesContext);
}

export function AiCapabilitiesProvider({ children }: { children: ReactNode }) {
  const [capabilities, setCapabilities] = useState<AiCapabilities>();
  const [hasFailed, setHasFailed] = useState(false);
  const attempt = useRef(0);

  const load = useCallback(async () => {
    const current = ++attempt.current;
    setHasFailed(false);
    const result = await fetchAiCapabilities();
    if (current !== attempt.current) return;
    if (result.ok) {
      setCapabilities(result.data);
      return;
    }
    setHasFailed(true);
  }, []);

  useEffect(() => {
    void load();
    return () => {
      // Unmounted: no later response may land.
      attempt.current++;
    };
  }, [load]);

  const value = useMemo<AiCapabilitiesValue>(
    () => ({ capabilities, hasFailed, retry: () => void load() }),
    [capabilities, hasFailed, load],
  );

  return (
    <AiCapabilitiesContext.Provider value={value}>
      {children}
    </AiCapabilitiesContext.Provider>
  );
}
