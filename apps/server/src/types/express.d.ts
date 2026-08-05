/**
 * Request augmentation for the authenticated-parent context (file 09).
 *
 * Both properties are optional because they only exist after `requireParent`
 * has run. Route handlers should not reach for them directly — call
 * `authContext(req)` from `middleware/require-parent.ts`, which narrows them to
 * non-optional or throws.
 *
 * The session type is derived from the better-auth instance rather than
 * hand-written, so `session.additionalFields` in `lib/auth.ts` stays the single
 * definition of `activeChildProfileId`.
 */
import type { ChildProfile, Parent } from "@kidlearn/db";
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
    }
  }
}
