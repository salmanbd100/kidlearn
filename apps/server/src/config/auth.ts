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

/** Measured from the session's `createdAt`, which better-auth never moves, so activity cannot extend it (parents' 30-day expiry slides). */
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Signs a user out everywhere: every session row goes, so every cookie for them stops resolving. */
export async function revokeAllSessions(userId: string): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  return count;
}

// Only admins hold a password; parents sign in with Google alone.
async function hasPasswordSignIn(userId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true },
  });
  return account !== null;
}

function adminSessionCap(createdAt: Date | string | undefined): Date {
  const start = createdAt ? new Date(createdAt).getTime() : Date.now();
  return new Date(start + ADMIN_SESSION_MAX_AGE_MS);
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  // Locks the OAuth origin check and cookie usage to the one browser origin
  // this API answers, matching the CORS allowlist in app.ts.
  trustedOrigins: [env.WEB_ORIGIN],
  /** The only thing in this API that authenticates with a password. */
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
  // Off, not just implicit: the seeded admin is `emailVerified`, so a Google sign-in on the admin's address
  // would otherwise be linked onto the admin user and hand out an admin session without the password.
  account: {
    accountLinking: { enabled: false },
  },
  session: {
    expiresIn: SESSION_EXPIRES_IN_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
    additionalFields: {
      // Server-side session state, not a client header: a tampered header could address
      // another parent's child.
      activeChildProfileId: {
        type: "string",
        required: false,
        // Never let a client write this through better-auth's own session
        // update endpoint — only our validated route may set it.
        input: false,
      },
    },
  },
  // The cap lives on the row itself so better-auth's own `/api/auth/*` endpoints honour it, not just `requireAdmin`.
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          if (!(await hasPasswordSignIn(session.userId))) return;
          return {
            data: { ...session, expiresAt: adminSessionCap(session.createdAt) },
          };
        },
      },
      update: {
        // `before` sees only the changed fields, not whose session it is; a slide is pulled back here instead.
        after: async (session) => {
          if (!(await hasPasswordSignIn(session.userId))) return;
          const cap = adminSessionCap(session.createdAt);
          if (new Date(session.expiresAt).getTime() <= cap.getTime()) return;
          await prisma.session.updateMany({
            where: { id: session.id },
            data: { expiresAt: cap },
          });
        },
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
