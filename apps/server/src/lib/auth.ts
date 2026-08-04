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
 * Email/password stays disabled here forever; file 31 enables it behind a
 * separate admin surface, never on this provider list.
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { env } from "./env.js";
import { prisma } from "./prisma.js";

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
  emailAndPassword: { enabled: false },
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
