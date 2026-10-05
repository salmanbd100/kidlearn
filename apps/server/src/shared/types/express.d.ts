import type { AdminUser, ChildProfile, Parent } from "@kidlearn/db";
import type { auth } from "../../config/auth.js";

type BetterAuthSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

declare global {
  namespace Express {
    interface Request {
      parent?: Parent;
      session?: BetterAuthSession["session"];
      /** Attached by `loadOwnedChild` or `requireActiveChild`. */
      child?: ChildProfile;
      /** Attached by `requireAdmin`. */
      admin?: AdminUser;
    }
  }
}
