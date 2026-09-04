"use client";

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
import { useAudio } from "@/components/AudioProvider";
import { BigButton } from "@/components/kid/BigButton";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { toLocale } from "@/lib/locale";

/**
 * "Leave the lesson?" — the one thing between a mis-tap and losing a lesson.
 */
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
      {/* The primitive always renders a close button when dismissable, and an
          unlabelled one would be a control with no accessible name on the one dialog
          a child has to answer. Its own label rather than the *Stay* string, so the
          two are distinguishable to a screen reader even though they do the same. */}
      <DialogContent size="sm" closeLabel={t("exit.close")}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {t("exit.title")}
          </DialogTitle>
          {/* text-lg is the 20px floor for anything a child reads (design.md §3.2),
              so this overrides the primitive's parent-surface `text-sm`. */}
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
