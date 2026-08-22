import { Router } from "express";
import { requireActiveChild } from "../middleware/require-active-child.js";
import { requireParent } from "../middleware/require-parent.js";
import { charactersRouter } from "./characters.js";
import { childrenRouter } from "./children.js";
import { contentRouter } from "./content.js";
import { eventsRouter } from "./events.js";
import { jobsRouter } from "./jobs.js";
import { meRouter } from "./me.js";
import { parentRouter } from "./parent.js";
import { progressRouter } from "./progress.js";
import { screenTimeRouter } from "./screen-time.js";

/**
 * Aggregates every `/api/*` resource router. Later implementation files mount
 * their routers here.
 *
 * Paths under `/api` that match nothing fall through to `notFoundHandler`.
 */
export const apiRouter = Router();

// File 10 — the parent's own account: PIN, consent, deletion. The router
// applies `requireParent` itself, and `requirePinVerified` per route.
apiRouter.use("/parent", parentRouter);

apiRouter.use("/children", childrenRouter);

// The starter avatars a profile may wear (file 14). Its own resource rather than
// a path on `/children`, because a character is not a child's sub-resource — it
// is published content that every parent picks from.
apiRouter.use("/characters", charactersRouter);

// Curriculum reads (file 12). The two guards are mounted here rather than
// inside `content.ts` so that every current and future `/api/content/*` path is
// covered by construction — a new route added there cannot forget them.
apiRouter.use("/content", requireParent, requireActiveChild, contentRouter);

// Lesson progress and the player's event log (file 16). Same guards as
// `/api/content/*`, for the same reason and with the same consequence: progress
// belongs to the *active* child, resolved server-side, so no request body can name
// whose progress is being written.
apiRouter.use("/progress", requireParent, requireActiveChild, progressRouter);

// The presence signal learning time is derived from (file 27). Same guards as
// `/api/progress/*`, and the same consequence: a heartbeat is about the session's
// child, so no request body can name whose time is being recorded (FR-TIME-06).
apiRouter.use("/events", requireParent, requireActiveChild, eventsRouter);

// What the active child has earned (file 23). Same guards again, and the same
// consequence: "me" is the session's child, so nothing on these paths names whose
// rewards are being read.
apiRouter.use("/me", requireParent, requireActiveChild, meRouter);

// Whether the active child may start something new (file 28). A student-surface
// read behind the same guards, and deliberately not PIN-gated: the home screen
// checks it before every tile tap, so a blocked child meets a mascot rather than
// a parental gate. The settings it reflects are written on `/api/children/:id`,
// which is PIN-gated.
apiRouter.use(
  "/screen-time",
  requireParent,
  requireActiveChild,
  screenTimeRouter,
);

// Scheduled work (file 30). Not a parent surface and not the admin CMS: the whole
// router authenticates with a shared secret because its caller is cron-job.org,
// which has no session to hold. See `middleware/require-cron-secret.ts` for why
// that is the only workable credential here and what it constrains these routes to.
apiRouter.use("/admin/jobs", jobsRouter);
