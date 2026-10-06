"use client";

import { PARENT_NAMESPACE } from "@kidlearn/i18n";
import {
  type AvatarCharacterResponse,
  type ChildProfileResponse,
  MAX_CHILDREN_PER_PARENT,
} from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParentSession } from "@/app/(parent)/context/parent-session";
import { ChildCard } from "@/features/children/ChildCard";
import { DeleteChildDialog } from "@/features/children/DeleteChildDialog";
import { deleteChild, listAvatars } from "@/features/parent/parent-api";

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

  // The guard ensures a profile exists; empty means the last one was just deleted, before the redirect.
  const items = profiles ?? [];
  const isAtLimit = items.length >= MAX_CHILDREN_PER_PARENT;

  return (
    <main className="flex flex-1 flex-col gap-6 py-2">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl text-foreground">
          {t("children.title")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("children.subtitle")}
        </p>
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
              screenTimeHref={`/parent/children/${child.id}/screen-time`}
              onDeleteRequest={() => setPendingDeletion(child)}
            />
          ))}
        </ul>
      )}

      {isAtLimit ? (
        <p className="rounded-(--radius) bg-muted p-4 text-muted-foreground text-sm">
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
          onConfirm={(id) => deleteChild(id)}
          onDeleted={() => {
            setPendingDeletion(undefined);
            void refresh();
          }}
        />
      ) : null}
    </main>
  );
}
