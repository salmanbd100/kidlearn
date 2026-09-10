"use client";

import type { ScreenTimeSettingResponse } from "@kidlearn/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParentSession } from "@/app/(parent)/context/parent-session";
import { PARENT_ROUTES } from "@/features/parent/parent-redirect";
import { ScreenTimeForm } from "@/features/screen-time/ScreenTimeForm";
import {
  getScreenTime,
  updateScreenTime,
} from "@/features/screen-time/screen-time-api";
import { PARENT_NAMESPACE } from "@/shared/lib/i18n";

/** One child's screen-time settings (FR-TIME-01, FR-TIME-04..05). */
export function ScreenTimeScreen({ childId }: { childId: string }) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { children: profiles } = useParentSession();

  const [setting, setSetting] = useState<
    ScreenTimeSettingResponse | undefined
  >();
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    void getScreenTime(childId).then((result) => {
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
  }, [childId]);

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
            onSubmit={(values) => updateScreenTime(child.id, values)}
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
