/** The single better-auth instance for the whole server. */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { env } from "./env.js";
import { prisma } from "./prisma.js";

/** Floor for an admin password, enforced both here and in the seed script. */
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
