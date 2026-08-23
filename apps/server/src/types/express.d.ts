import type { AdminUser, ChildProfile, Parent } from "@kidlearn/db";
import type { auth } from "../lib/auth.js";

type BetterAuthSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

declare global {
  namespace Express {
    interface Request {
      /** The kidlearn domain row, provisioned lazily on first sign-in. */
      parent?: Parent;
      /** better-auth's session row, including `activeChildProfileId`. */
      session?: BetterAuthSession["session"];
      /** The ownership-checked child profile, attached by `loadOwnedChild` (file 11) or `requireActiveChild` (file 12). */
      child?: ChildProfile;
      /**
       * The admin domain row, attached by `requireAdmin` (file 31).
       *
       * Disjoint from `parent` by construction — a `User` has at most one of the
       * two (spec §4.3) — so a request that has one never has the other.
       */
      admin?: AdminUser;
    }
  }
}
