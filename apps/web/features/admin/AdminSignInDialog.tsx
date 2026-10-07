"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  ThemeScope,
} from "@kidlearn/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useQueryDialog } from "@/shared/hooks/use-query-dialog";
import { adminSignIn } from "./admin-api";
import { ADMIN_ROUTES, ADMIN_SIGN_IN_PARAM } from "./admin-routes";

/**
 * The CMS sign-in form, as a dialog over the homepage; `ADMIN_ROUTES.login` opens it. English-only
 * like the rest of the CMS (`frontend.md §4`), though it renders on a translated page.
 */
export function AdminSignInDialog() {
  const router = useRouter();
  const { isOpen, onOpenChange } = useQueryDialog(ADMIN_SIGN_IN_PARAM);
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
      // No session refresh: the CMS layout mounts a fresh `AdminSessionProvider`, which reads the new cookie.
      router.replace(ADMIN_ROUTES.analytics);
      return;
    }

    setIsSubmitting(false);
    setHasFailed(true);
  }

  return (
    <ThemeScope theme="parent" className="contents font-ui text-foreground">
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent size="sm" closeLabel="Close">
          <DialogHeader>
            <DialogTitle className="text-xl">kidlearn CMS</DialogTitle>
            <DialogDescription>
              Sign in with your administrator account.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
            noValidate
          >
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
        </DialogContent>
      </Dialog>
    </ThemeScope>
  );
}
