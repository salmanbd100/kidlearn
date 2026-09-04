"use client";

import { Button, Input, Label } from "@kidlearn/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useAdminSession } from "@/app/(admin)/context/admin-session";
import { adminSignIn } from "@/lib/admin-api";
import { ADMIN_ROUTES } from "@/lib/admin-routes";

/**
 * `/admin/login` — email and password, and nothing else (file 31, spec §4.3).
 */
export function AdminLoginScreen() {
  const router = useRouter();
  const { refresh } = useAdminSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setHasFailed(false);

    const { ok } = await adminSignIn(email, password);
    if (ok) {
      // The provider above mounted on this page and resolved `signedOut`, so the
      // session has to be re-read before navigating or `AdminGuard` would bounce
      // the brand-new session straight back here.
      await refresh();
      router.replace(ADMIN_ROUTES.analytics);
      return;
    }

    setIsSubmitting(false);
    setHasFailed(true);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-foreground text-xl">kidlearn CMS</h1>
        <p className="text-muted-foreground text-sm">
          Sign in with your administrator account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-email">Email</Label>
          <Input
            id="admin-email"
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-password">Password</Label>
          <Input
            id="admin-password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {hasFailed ? (
          <p role="alert" className="text-destructive text-sm">
            Those details did not match an administrator account.
          </p>
        ) : null}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
