"use client";

import { LESSON_NAMESPACE, toLocale } from "@kidlearn/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kidlearn/ui";
import { DoorOpen, Play } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/shared/components/AudioProvider";
import { BigButton } from "@/shared/components/kid/BigButton";

export function ExitConfirm({
  isOpen,
  onStay,
  onLeave,
}: {
  isOpen: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  const { t, i18n } = useTranslation(LESSON_NAMESPACE);
  const { play } = useAudio();
  const locale = toLocale(i18n.resolvedLanguage);

  useEffect(() => {
    if (!isOpen) return;
    void play(`/audio/ui/exit-confirm.${locale}.mp3`, { interrupt: true });
  }, [isOpen, play, locale]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onStay();
      }}
    >
      {/*
        The primitive always renders a close button; it gets its own label so a screen reader tells
        it apart from *Stay*.
      */}
      <DialogContent size="sm" closeLabel={t("exit.close")} closeSize="kid">
        <DialogHeader gutter="kidInset">
          <DialogTitle className="font-display text-2xl">
            {t("exit.title")}
          </DialogTitle>
          {/*
            text-lg is the 20px floor for text a child reads (design.md §3.2); overrides the
            primitive's `text-sm`.
          */}
          <DialogDescription className="text-foreground text-lg">
            {t("exit.intro")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <BigButton
            size="lg"
            variant="success"
            icon={<Play aria-hidden="true" />}
            onPress={onStay}
          >
            {t("exit.stay")}
          </BigButton>
          <BigButton
            size="lg"
            variant="secondary"
            icon={<DoorOpen aria-hidden="true" />}
            onPress={onLeave}
          >
            {t("exit.leave")}
          </BigButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
