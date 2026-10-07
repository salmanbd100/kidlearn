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
import {
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
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
  const [isPasswordShown, setIsPasswordShown] = useState(false);
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

  // The dialog only hides, so its state outlives a close; on a shared tablet the next visitor must not
  // find the password typed in, one tap from the reveal button.
  function handleOpenChange(isNowOpen: boolean) {
    if (!isNowOpen) {
      setEmail("");
      setPassword("");
      setIsPasswordShown(false);
      setHasFailed(false);
    }
    onOpenChange(isNowOpen);
  }

  return (
    <ThemeScope theme="parent" className="contents font-ui text-foreground">
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent size="sm" closeLabel="Close" className="gap-6 p-8">
          <DialogHeader
            gutter="flush"
            className="items-center gap-3 text-center"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <LockKeyhole aria-hidden="true" className="size-7" />
            </span>
            <DialogTitle className="text-2xl">kidlearn CMS</DialogTitle>
            <DialogDescription className="text-base">
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
                aria-invalid={hasFailed}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-password">Password</Label>
              <div className="relative">
                <Input
                  id="admin-password"
                  type={isPasswordShown ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  required
                  aria-invalid={hasFailed}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pr-12"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Show password"
                  aria-pressed={isPasswordShown}
                  onClick={() => setIsPasswordShown((isShown) => !isShown)}
                  className="absolute top-0 right-0 text-muted-foreground"
                >
                  {isPasswordShown ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>
            {hasFailed ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-(--radius) bg-destructive/10 p-3 text-destructive text-sm"
              >
                <CircleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                Those details did not match an administrator account.
              </p>
            ) : null}
            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="mt-2 w-full"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
          <p className="border-border border-t pt-5 text-center text-muted-foreground text-sm">
            Parent accounts use Google sign-in, not this form.
          </p>
        </DialogContent>
      </Dialog>
    </ThemeScope>
  );
}
