"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useParentSession } from "@/app/(parent)/context/parent-session";
import { ChildProfileForm } from "@/components/parent/ChildProfileForm";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { updateChild } from "@/lib/parent-api";
import { PARENT_ROUTES } from "@/lib/parent-redirect";

/**
 * Edit a profile (FR-PROF-05).
 *
 * The profile is read from the session context rather than fetched by id: the list
 * is already loaded, so `GET /api/children/{id}` would ask for a row the client is
 * holding. An unknown id therefore means either a deleted profile or another
 * parent's — indistinguishable here for the same reason the API answers `404` to
 * both (NFR-SAFE-02) — and gets the same message either way.
 *
 * The form submits every field it validated, not just the changed ones. `PATCH`
 * accepts a partial body, but the parent reviewed the whole form, and diffing would
 * mean deciding what "unchanged" means for a trimmed string.
 */
export function EditChildScreen({ childId }: { childId: string }) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const router = useRouter();
  const { children: profiles, refresh } = useParentSession();

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
      <h1 className="font-semibold text-2xl text-foreground">
        {t("form.editTitle", { name: child.firstName })}
      </h1>
      <ChildProfileForm
        initial={child}
        onSubmit={(values) => updateChild(child.id, values)}
        onSaved={() => {
          void refresh().then(() => router.push(PARENT_ROUTES.children));
        }}
        submitLabel={t("form.save")}
        cancelHref={PARENT_ROUTES.children}
      />
    </main>
  );
}
