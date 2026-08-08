"use client";

import { Button } from "@kidlearn/ui";
import { useTranslation } from "react-i18next";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { googleSignInUrl } from "@/lib/parent-api";

/**
 * Google, and nothing else (FR-AUTH-02).
 *
 * There is no email field, no password field, and no sign-up step anywhere on this
 * screen or behind it — the Google callback creates the identity and the first
 * authenticated request creates the domain row. Email/password is disabled in
 * `lib/auth.ts` for parents permanently; the admin surface in file 31 is a
 * separate provider list.
 *
 * The button is a plain anchor rather than a fetch: signing in is a chain of
 * cross-origin redirects, so it has to be a real navigation. `GET
 * /api/auth/google` exists for exactly this reason — better-auth's own
 * `sign-in/social` is POST-only, which a link cannot do — and the server owns the
 * post-login destination, so no callback URL is passed from here.
 */
export function LoginScreen() {
  const { t } = useTranslation(PARENT_NAMESPACE);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 py-12">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="font-semibold text-2xl text-foreground">
          {t("login.title")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("login.subtitle")}</p>
      </div>

      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        <Button asChild size="lg" className="w-full">
          <a href={googleSignInUrl()}>{t("login.google")}</a>
        </Button>
        <p className="text-center text-muted-foreground text-xs">
          {t("login.privacy")}
        </p>
        <LanguageSwitch size="default" />
      </div>
    </main>
  );
}
