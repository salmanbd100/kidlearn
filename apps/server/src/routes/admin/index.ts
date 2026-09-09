import type { AdminIdentity, PlatformOverview } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../../lib/errors.js";
import { adminContext, requireAdmin } from "../../middleware/require-admin.js";
import { getPlatformOverview } from "../../services/adminAnalyticsService.js";
import { adminAiRouter } from "./ai.js";
import { adminContentRouter } from "./content.js";
import { adminContentEditorsRouter } from "./content-editors.js";
import { adminMediaRouter } from "./media.js";

export const adminRouter = Router();

adminRouter.use(requireAdmin);

adminRouter.use("/content", adminContentRouter);
adminRouter.use("/content", adminContentEditorsRouter);
adminRouter.use("/media", adminMediaRouter);
adminRouter.use("/ai", adminAiRouter);
adminRouter.get("/me", (req, res) => {
  const admin = adminContext(req);
  const payload: SuccessEnvelope<AdminIdentity> = {
    data: { id: admin.id, name: admin.name, email: admin.email },
  };
  res.json(payload);
});

adminRouter.get("/analytics/overview", async (_req, res, next) => {
  try {
    const overview = await getPlatformOverview();

    const payload: SuccessEnvelope<PlatformOverview> = { data: overview };
    res.json(payload);
  } catch (error) {
    next(error);
  }
});
