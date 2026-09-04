"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  useParentGate,
  useParentSession,
} from "@/app/(parent)/context/parent-session";
import { ChildProfileForm } from "@/components/parent/ChildProfileForm";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { createChild } from "@/lib/parent-api";
import { PARENT_ROUTES } from "@/lib/parent-redirect";

/** Add a second-through-fifth profile (FR-PROF-01). */
export function NewChildScreen() {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const router = useRouter();
  const { refresh } = useParentSession();
  const { guard } = useParentGate();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 py-2">
      <h1 className="font-semibold text-2xl text-foreground">
        {t("form.newTitle")}
      </h1>
      <ChildProfileForm
        onSubmit={(values) => guard(createChild(values))}
        onSaved={() => {
          void refresh().then(() => router.push(PARENT_ROUTES.children));
        }}
        submitLabel={t("form.create")}
        cancelHref={PARENT_ROUTES.children}
      />
    </main>
  );
}
