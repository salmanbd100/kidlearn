"use client";

import type { ScreenTimeSettingResponse } from "@kidlearn/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useParentGate,
  useParentSession,
} from "@/app/(parent)/context/parent-session";
import { ScreenTimeForm } from "@/components/parent/ScreenTimeForm";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { PARENT_ROUTES } from "@/lib/parent-redirect";
import { getScreenTime, updateScreenTime } from "@/lib/screen-time-api";

/**
 * One child's screen-time settings (FR-TIME-01, FR-TIME-04..05).
 *
 * The child comes from the session context, the way `EditChildScreen` reads it:
 * the profile list is already loaded, so fetching one by id would be asking for a
 * row the client holds. An unknown id is a deleted profile or another parent's —
 * indistinguishable here for the same reason the API answers `404` to both
 * (NFR-SAFE-02) — and gets the same message either way.
 *
 * The *policy* is fetched, because nothing else on the page has it and it is not
 * part of a child profile. Both calls go through `guard`, since both ends of this
 * route are PIN-gated: a lapsed grant re-opens the PIN pad rather than showing a
 * parent an error they cannot act on.
 *
 * The confirmation stays on this screen instead of navigating away. A parent
 * setting a limit usually wants to see what they set, and often to adjust it once
 * — bouncing them back to the list would make the second adjustment a navigation.
 */
export function ScreenTimeScreen({ childId }: { childId: string }) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { children: profiles } = useParentSession();
  const { guard } = useParentGate();

  const [setting, setSetting] = useState<
    ScreenTimeSettingResponse | undefined
  >();
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    void guard(getScreenTime(childId)).then((result) => {
      if (!isCurrent) return;
      if (result.ok) {
        setSetting(result.data);
        setStatus("ready");
        return;
      }
      setStatus("error");
    });

    return () => {
      isCurrent = false;
    };
    // Keyed on the child alone. `guard` is a new closure whenever the gate's
    // state changes, and depending on it would re-fetch the policy every time the
    // PIN pad opened or closed.
  }, [childId, guard]);

  const child = profiles?.find((profile) => profile.id === childId);

  if (child === undefined) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {t("errors.notFound")}
      </p>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 py-2">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl text-foreground">
          {t("screenTime.title", { name: child.firstName })}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("screenTime.subtitle", { name: child.firstName })}
        </p>
      </header>

      {status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {t("errors.generic")}
        </p>
      ) : status === "loading" || setting === undefined ? (
        <p className="text-muted-foreground text-sm">
          {t("screenTime.loading")}
        </p>
      ) : (
        <>
          {isSaved ? (
            <p
              role="status"
              className="rounded-[var(--radius)] bg-muted p-4 text-muted-foreground text-sm"
            >
              {t("screenTime.saved")}
            </p>
          ) : null}
          <ScreenTimeForm
            childName={child.firstName}
            initial={setting}
            onSubmit={(values) => guard(updateScreenTime(child.id, values))}
            onSaved={(saved) => {
              setSetting(saved);
              setIsSaved(true);
            }}
            cancelHref={PARENT_ROUTES.children}
          />
        </>
      )}
    </main>
  );
}
