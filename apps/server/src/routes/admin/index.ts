import type { AdminIdentity, PlatformOverview } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../../lib/errors.js";
import { adminContext, requireAdmin } from "../../middleware/require-admin.js";
import { getPlatformOverview } from "../../services/adminAnalyticsService.js";
import { adminAiRouter } from "./ai.js";
import { adminContentRouter } from "./content.js";
import { adminContentEditorsRouter } from "./content-editors.js";
import { adminMediaRouter } from "./media.js";

/** `/api/admin` — the administrator surface (spec §4.3, FR-CMS-01). */
export const adminRouter = Router();

adminRouter.use(requireAdmin);

// File 32 — CRUD over the curriculum hierarchy. A nested router rather than
// paths on this one, because it registers four resources' worth of operations
// and the OpenAPI coverage walk reads a router's own registrations: giving it its
// own mount is what lets `coverage.test.ts` see it with the right prefix.
adminRouter.use("/content", adminContentRouter);

// File 33 — the guided editors for quizzes, activities and badges. A second
// router at the same mount path rather than more paths on the one above, so the
// OpenAPI coverage walk can see and document the two surfaces separately; Express
// consults both in registration order, so the split is invisible to a client.
adminRouter.use("/content", adminContentEditorsRouter);

// File 33 — the media library (FR-CMS-02). Its own mount for the same reason:
// `coverage.test.ts` reads a router's own registrations and needs the prefix.
adminRouter.use("/media", adminMediaRouter);

// File 34 — the AI generation pipeline (FR-AI-01, FR-AI-08). Its own mount, same
// reason again. Nothing under it can publish: a generator writes drafts and a job
// row, and the review queue that can change that arrives with file 37.
adminRouter.use("/ai", adminAiRouter);

/**
 * Who am I. Consumed by `AdminGuard` on the web side to decide between the CMS
 * and the login screen, and by the sidebar footer to name the signed-in admin.
 */
adminRouter.get("/me", (req, res) => {
  const admin = adminContext(req);

  const payload: SuccessEnvelope<AdminIdentity> = {
    data: { id: admin.id, name: admin.name, email: admin.email },
  };
  res.json(payload);
});

/** Platform counters for the analytics page (FR-CMS-07, basic tier). */
adminRouter.get("/analytics/overview", async (_req, res, next) => {
  try {
    const overview = await getPlatformOverview();

    const payload: SuccessEnvelope<PlatformOverview> = { data: overview };
    res.json(payload);
  } catch (error) {
    next(error);
  }
});
