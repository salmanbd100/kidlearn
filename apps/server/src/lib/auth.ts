/**
 * The single better-auth instance for the whole server.
 *
 * Division of ownership (see document/database-design.md §5):
 *   better-auth owns identity — `User`, `Session`, `Account`, `Verification`.
 *   kidlearn owns domain data — `Parent` (PIN, consent, children), `AdminUser`.
 * The two are linked by `Parent.userId → User.id`, populated lazily on the
 * first authenticated request by `requireParent`.
 *
 * Google is the ONLY sign-in method for parents (spec §4.2, FR-AUTH-02).
 * Email/password is enabled below for **admins only** (file 31), with sign-up
 * disabled — see the note on `emailAndPassword`. It is never added to
 * `socialProviders`, and no parent surface offers a password field.
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { env } from "./env.js";
import { prisma } from "./prisma.js";

/**
 * Floor for an admin password, enforced both here and in the seed script.
 *
 * Above better-auth's default of 8 because these accounts have no rate limiting
 * until file 38 and no second factor at all, so length is the whole of the
 * defence.
 */
export const ADMIN_MIN_PASSWORD_LENGTH = 12;

/** Days, in seconds — used for the session lifetime below. */
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;
/** How stale a session may get before a request slides its expiry forward. */
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  // Locks the OAuth origin check and cookie usage to the one browser origin
  // this API answers, matching the CORS allowlist in app.ts.
  trustedOrigins: [env.WEB_ORIGIN],
  /**
   * The admin credential surface (file 31, spec §4.3) — and the *only* thing in
   * this API that authenticates with a password.
   *
   * **One better-auth instance, not two.** A second instance for admins would
   * mean a second session store, a second cookie name, a second CORS and
   * cookie-domain configuration, and two places for a session bug to live. The
   * parent/admin separation is enforced one layer up instead: `requireAdmin`
   * demands an `AdminUser` row for `session.user.id` and `requireParent` demands
   * a `Parent` row with a Google account, so neither guard can be satisfied by
   * the other's session. The accepted cost is that parents and admins share the
   * better-auth `user` table.
   *
   * *The rejected alternative, for the Phase-2 reviewer:* a hand-rolled
   * credential route plus a separate signed admin cookie. It buys real table
   * separation and costs password hashing, session issuing, rotation and CSRF
   * handling that this library already does correctly. Not worth writing twice.
   *
   * **`disableSignUp` is what makes this safe.** With it, `POST
   * /api/auth/sign-up/email` answers 400 for everyone — nobody can mint an admin
   * identity, and a Google-authenticated parent has no credential account to
   * sign in with. Admins exist only because `scripts/seed-admin.ts` created
   * them, and re-running the seed is how a *forgotten* password is recovered —
   * there is no self-service reset. `POST /api/auth/forget-password` is not even
   * registered, because no `sendResetPassword` is configured; `reset-password` is
   * registered but unreachable, since only `forget-password` can mint the token it
   * demands. A signed-in admin can still change their own password through
   * better-auth's `POST /api/auth/change-password`, which is undocumented here
   * because `apps/web` does not call it. (File 38 owns rate limiting on the login
   * route.)
   *
   * `minPasswordLength` matches the floor the seed script enforces, so a weak
   * password is refused at both ends rather than only in the script.
   */
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: ADMIN_MIN_PASSWORD_LENGTH,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  session: {
    expiresIn: SESSION_EXPIRES_IN_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
    additionalFields: {
      // FR-AUTH-06 — which child profile the current session is acting as.
      // Deliberately server-side session state rather than a client-supplied
      // header: a tampered header could address another parent's child, and
      // session state survives a page reload without re-authenticating.
      // The setter (`POST /api/children/:id/activate`) ships in file 11.
      activeChildProfileId: {
        type: "string",
        required: false,
        // Never let a client write this through better-auth's own session
        // update endpoint — only our validated route may set it.
        input: false,
      },
      // FR-AUTH-04 — the parental-PIN grant, valid for 15 minutes after
      // `POST /api/parent/pin/verify`. Kept on the session rather than in a
      // second signed cookie so there is exactly one source of truth and
      // signing out revokes the grant for free.
      pinVerifiedUntil: {
        type: "date",
        required: false,
        // Writable only by our verify route, never through better-auth's own
        // session-update endpoint — otherwise the PIN gate is bypassable.
        input: false,
      },
    },
  },
  advanced: {
    // httpOnly + sameSite=lax are better-auth defaults; pinned explicitly so a
    // future upstream default change cannot silently loosen them.
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    },
  },
});
