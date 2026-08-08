"use client";

import type { WorldSummaryResponse } from "@kidlearn/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RewardStrip } from "@/components/student/RewardStrip";
import { WorldCard } from "@/components/student/WorldCard";
import { useActiveChild } from "@/lib/active-child";
import { listWorlds } from "@/lib/content-api";
import { STUDENT_NAMESPACE } from "@/lib/i18n";
import { useScreenNarration } from "@/lib/use-screen-narration";
import { StudentStatus } from "../StudentGuard";

/**
 * The child's home (FR-WORLD-01..03, FR-GAM-06 display).
 *
 * Every world on this screen came out of `GET /api/content/worlds` — there is no
 * list of worlds in this file, no `if (slug === "jungle")`, and no palette
 * literal. Adding Space World is a row in the database (FR-WORLD-05), and the
 * test for that property asserts the styling comes from the response.
 *
 * The counters are display-only. `stats` arrives on the active child's profile
 * and is rendered exactly as sent; nothing here can change a number, which is the
 * client half of progress being server-authoritative (spec §7).
 */
export function HomeScreen() {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const { child } = useActiveChild();
  const [worlds, setWorlds] = useState<WorldSummaryResponse[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [isWakingUp, setIsWakingUp] = useState(false);

  useScreenNarration("home");

  useEffect(() => {
    let isCurrent = true;
    void listWorlds({
      onColdStart: () => {
        if (isCurrent) setIsWakingUp(true);
      },
    }).then((result) => {
      if (!isCurrent) return;
      setIsWakingUp(false);
      if (result.ok) {
        setWorlds(result.data.worlds);
        setStatus("ready");
        return;
      }
      setStatus("error");
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  // `StudentGuard` does not render this screen without a child, so the fallback
  // is for the frame between a profile switch and the guard's redirect.
  if (child === undefined) return null;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex flex-col gap-4">
        {/* Right-padded past the parent-corner lock so a long Bangla name never
            runs under it (design.md §1.7 — layouts absorb ±40% text swings). */}
        <h1 className="pr-14 font-display text-2xl text-foreground sm:text-3xl">
          {t("home.greeting", { name: child.firstName })}
        </h1>
        <RewardStrip stats={child.stats} />
      </header>

      {status === "error" ? (
        <StudentStatus tone="alert">{t("status.error")}</StudentStatus>
      ) : status === "loading" ? (
        <StudentStatus tone="status">
          {isWakingUp ? t("status.waking") : t("selectProfile.loading")}
        </StudentStatus>
      ) : worlds.length === 0 ? (
        <StudentStatus tone="status">{t("home.empty")}</StudentStatus>
      ) : (
        <>
          <p className="font-display text-foreground text-xl">
            {t("home.pickWorld")}
          </p>
          {/* Stacked in portrait, side by side the moment there is width for it —
              which covers a landscape phone as well as a tablet (design.md §6). */}
          <ul className="grid grid-cols-1 gap-6 landscape:grid-cols-2 sm:grid-cols-2">
            {worlds.map((world) => (
              <li key={world.id} className="contents">
                <WorldCard
                  world={world}
                  onPress={() => router.push(`/world/${world.id}`)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
