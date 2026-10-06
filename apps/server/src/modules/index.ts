import { Router } from "express";
import { requireActiveChild } from "../shared/middleware/require-active-child.js";
import { requireConsent } from "../shared/middleware/require-consent.js";
import { adminRouter } from "./admin/admin.routes.js";
import { charactersRouter } from "./characters/characters.routes.js";
import { childrenRouter } from "./children/children.routes.js";
import { adminLessonPreview } from "./content/admin-lesson-preview.middleware.js";
import { contentRouter } from "./content/content.routes.js";
import { eventsRouter } from "./events/events.routes.js";
import { jobsRouter } from "./jobs/jobs.routes.js";
import { meRouter } from "./me/me.routes.js";
import { parentRouter } from "./parent/parent.routes.js";
import { requireParent } from "./parent/require-parent.middleware.js";
import { progressRouter } from "./progress/progress.routes.js";
import { screenTimeRouter } from "./screen-time/screen-time.routes.js";

export const apiRouter = Router();

// The parent's own account: consent and deletion. The router applies `requireParent` itself.
apiRouter.use("/parent", parentRouter);

apiRouter.use("/children", childrenRouter);

// Its own resource: a character is published content every parent picks from, not a child's sub-resource.
apiRouter.use("/characters", charactersRouter);

// Guards are mounted here, not in `content.routes.ts`, so every `/api/content/*` path is covered by construction.
apiRouter.use(
  "/content",
  adminLessonPreview,
  requireParent,
  requireActiveChild,
  contentRouter,
);

// Progress belongs to the active child resolved server-side, so no request body names whose. Consent is checked on
// every request, not just at profile creation: these writes grow the child's record, and a bumped `CONSENT_VERSION`
// must stop that until the parent accepts the new text (FR-AUTH-03). `/content`, `/me` and `/screen-time` stay
// ungated: they only read what is already held, and blocking them would strand a child mid-session for no gain.
apiRouter.use(
  "/progress",
  requireParent,
  requireConsent,
  requireActiveChild,
  progressRouter,
);

// Same guards: a heartbeat is about the session's child; no body can name whose time is recorded (FR-TIME-06).
apiRouter.use(
  "/events",
  requireParent,
  requireConsent,
  requireActiveChild,
  eventsRouter,
);

// Same guards: "me" is the session's child, so no path names whose rewards are read.
apiRouter.use("/me", requireParent, requireActiveChild, meRouter);

// Student-surface read behind the same guards; the home screen checks it before every tile tap.
apiRouter.use(
  "/screen-time",
  requireParent,
  requireActiveChild,
  screenTimeRouter,
);

// Authenticates with a shared secret because its caller (cron-job.org) holds no session; see `shared/middleware/require-cron-secret.ts`.
apiRouter.use("/admin/jobs", jobsRouter);

// Mounted after `/admin/jobs` on purpose: this router applies `requireAdmin` to everything under it, which would block the scheduler's paths.
apiRouter.use("/admin", adminRouter);
