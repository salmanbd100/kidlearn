"use client";

import type {
  AvatarCharacterResponse,
  ChildProfileResponse,
} from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParentSession } from "@/app/(parent)/context/parent-session";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { ChildCard } from "@/components/parent/ChildCard";
import { DeleteChildDialog } from "@/components/parent/DeleteChildDialog";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { deleteChild, listAvatars } from "@/lib/parent-api";

/** FR-PROF-01 — a household may hold at most five learner profiles. */
const MAX_CHILDREN = 5;

/**
 * The profile list (FR-PROF-05..06).
 *
 * The five-profile cap is enforced in two places on purpose. Here, the Add button
 * is replaced by a friendly note once five exist, so a parent is not invited into a
 * form that must fail. And in `ChildProfileForm`, a `409` from the server becomes
 * that same note — which covers the case this screen cannot, where a second device
 * created the fifth profile while this one was showing four.
 *
 * Profiles come from the session context, which already loaded them to decide
 * whether onboarding was finished. Fetching them again here would be a second
 * request for an answer already on the page, and two copies that can disagree.
 */
export function ChildrenScreen() {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { children: profiles, refresh } = useParentSession();
  const [avatars, setAvatars] = useState<AvatarCharacterResponse[]>([]);
  const [pendingDeletion, setPendingDeletion] = useState<
    ChildProfileResponse | undefined
  >();

  useEffect(() => {
    let isCurrent = true;
    void listAvatars().then((result) => {
      if (isCurrent && result.ok) setAvatars(result.data);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  // `ParentGuard` does not render this screen until the profiles have loaded and
  // there is at least one, so an empty array here means a parent who just deleted
  // their last profile — a real state, briefly, before the guard redirects.
  const items = profiles ?? [];
  const isAtLimit = items.length >= MAX_CHILDREN;

  return (
    <main className="flex flex-1 flex-col gap-6 py-2">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl text-foreground">
            {t("children.title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("children.subtitle")}
          </p>
        </div>
        <LanguageSwitch size="default" />
      </header>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("children.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((child) => (
            <ChildCard
              key={child.id}
              child={child}
              avatars={avatars}
              editHref={`/parent/children/${child.id}/edit`}
              onDeleteRequest={() => setPendingDeletion(child)}
            />
          ))}
        </ul>
      )}

      {isAtLimit ? (
        <p className="rounded-[var(--radius)] bg-muted p-4 text-muted-foreground text-sm">
          {t("children.limitReached")}
        </p>
      ) : (
        <Button asChild variant="outline" className="self-start">
          <Link href="/parent/children/new">
            <Plus aria-hidden="true" />
            {t("children.add")}
          </Link>
        </Button>
      )}

      {pendingDeletion !== undefined ? (
        <DeleteChildDialog
          child={pendingDeletion}
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setPendingDeletion(undefined);
          }}
          onConfirm={deleteChild}
          onDeleted={() => {
            setPendingDeletion(undefined);
            void refresh();
          }}
        />
      ) : null}
    </main>
  );
}
