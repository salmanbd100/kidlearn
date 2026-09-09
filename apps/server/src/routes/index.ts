import { Router } from "express";
import { adminLessonPreview } from "../middleware/admin-lesson-preview.js";
import { requireActiveChild } from "../middleware/require-active-child.js";
import { requireParent } from "../middleware/require-parent.js";
import { adminRouter } from "./admin/index.js";
import { charactersRouter } from "./characters.js";
import { childrenRouter } from "./children.js";
import { contentRouter } from "./content.js";
import { eventsRouter } from "./events.js";
import { jobsRouter } from "./jobs.js";
import { meRouter } from "./me.js";
import { parentRouter } from "./parent.js";
import { progressRouter } from "./progress.js";

export const apiRouter = Router();

apiRouter.use("/parent", parentRouter);
apiRouter.use("/children", childrenRouter);
apiRouter.use("/characters", charactersRouter);
apiRouter.use(
  "/content",
  adminLessonPreview,
  requireParent,
  requireActiveChild,
  contentRouter,
);
apiRouter.use("/progress", requireParent, requireActiveChild, progressRouter);
apiRouter.use("/events", requireParent, requireActiveChild, eventsRouter);
apiRouter.use("/me", requireParent, requireActiveChild, meRouter);
apiRouter.use("/admin/jobs", jobsRouter);
apiRouter.use("/admin", adminRouter);
