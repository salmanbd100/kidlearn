import type { AdminIdentity, PlatformOverview } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../../lib/errors.js";
import { adminContext, requireAdmin } from "../../middleware/require-admin.js";
import { getPlatformOverview } from "../../services/adminAnalyticsService.js";

/**
 * `/api/admin` — the administrator surface (spec §4.3, FR-CMS-01).
 *
 * `requireAdmin` is applied to the router rather than per route, so every path
 * files 32–37 add here is guarded by construction: a new curriculum endpoint
 * cannot forget the check that keeps parents out.
 *
 * Not to be confused with `/api/admin/jobs` (file 30), which is mounted *before*
 * this router in `routes/index.ts` and authenticates with a shared secret. Its
 * caller is a scheduler with no session to hold, so it deliberately predates and
 * does not use admin auth — see `middleware/require-cron-secret.ts`.
 */
export const adminRouter = Router();

adminRouter.use(requireAdmin);

/**
 * Who am I. Consumed by `AdminGuard` on the web side to decide between the CMS
 * and the login screen, and by the sidebar footer to name the signed-in admin.
 *
 * Three fields, not the row: `role` stays server-side while there is only one
 * flat role to have (file 31 out-of-scope), and `authUserId` is an internal join
 * key that no client has any use for.
 */
adminRouter.get("/me", (req, res) => {
  const admin = adminContext(req);

  const payload: SuccessEnvelope<AdminIdentity> = {
    data: { id: admin.id, name: admin.name, email: admin.email },
  };
  res.json(payload);
});

/**
 * Platform counters for the analytics page (FR-CMS-07, basic tier).
 *
 * No parameters at all — not a range, not a date. The two windows are derived
 * from the server clock and `APP_TIMEZONE`, so this page and a parent's dashboard
 * cannot disagree about where a day or a week begins, and there is no input for a
 * caller to widen the query with.
 */
adminRouter.get("/analytics/overview", async (_req, res, next) => {
  try {
    const overview = await getPlatformOverview();

    const payload: SuccessEnvelope<PlatformOverview> = { data: overview };
    res.json(payload);
  } catch (error) {
    next(error);
  }
});
