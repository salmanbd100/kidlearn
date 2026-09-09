import type { AdminUser, ChildProfile, Parent } from "@kidlearn/db";
import type { auth } from "../lib/auth.js";

type BetterAuthSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

declare global {
  namespace Express {
    interface Request {
      parent?: Parent;
      session?: BetterAuthSession["session"];
      child?: ChildProfile;
      admin?: AdminUser;
    }
  }
}
