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
 *
 * Three deliberate choices, all from the same principle (design.md §1.2 — nothing
 * destructive is one easy tap away):
 *
 *  - **The answers are two big buttons.** Both are ≥64px targets. A child who cannot
 *    read still has a green *go back to playing* and a plainly different *leave*,
 *    each with its own icon, so the choice is not carried by text.
 *  - **Every accidental way out means *stay*.** The primitive's small close button,
 *    Escape, and a tap on the scrim all route to `onStay` — so the outcome of a
 *    mis-tap is always the harmless one, and only the labelled *Leave* leaves. The
 *    close button is given the *Stay* label for that reason: it is not a third
 *    option, it is the same answer in a smaller shape.
 *  - **Staying is the default.** `Stay` is the primary action and is first in the
 *    DOM, so it takes focus when Radix traps it.
 *  - **It is spoken.** A pre-reader gets the question aloud on open, through the
 *    shared channel so it interrupts whatever the step was narrating.
 *
 * Nothing is at stake if the child does leave: every step was reported as it
 * finished, so `Leave` returns to the world screen with the place already saved.
 * The copy says so, for the grown-up who is reading over their shoulder.
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
