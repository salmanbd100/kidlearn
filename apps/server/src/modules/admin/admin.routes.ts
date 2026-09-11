import type { AdminIdentity, PlatformOverview } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";
import {
  adminContext,
  requireAdmin,
} from "../../shared/middleware/require-admin.js";
import { adminAiRouter } from "./ai/ai.routes.js";
import { getPlatformOverview } from "./analytics.service.js";
import { adminContentRouter } from "./content/content.routes.js";
import { adminContentEditorsRouter } from "./content-editors/content-editors.routes.js";
import { adminMediaRouter } from "./media/media.routes.js";

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
