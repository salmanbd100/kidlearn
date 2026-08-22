import type {
  CharacterUnlockResponse,
  DashboardData,
  LearningTimeResponse,
  ScreenTimeSettingResponse,
  WeeklyReportList,
} from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { loadOwnedChild, ownedChild } from "../middleware/load-owned-child.js";
import { requireConsent } from "../middleware/require-consent.js";
import { authContext, requireParent } from "../middleware/require-parent.js";
import { requirePinVerified } from "../middleware/require-pin-verified.js";
import { validate, validatedQuery } from "../middleware/validate.js";
import {
  ChildIdParamsSchema,
  type CreateChildBody,
  CreateChildBodySchema,
  type UpdateChildBody,
  UpdateChildBodySchema,
} from "../schemas/children.js";
import {
  type LearningTimeQuery,
  LearningTimeQuerySchema,
} from "../schemas/events.js";
import {
  type ScreenTimeBody,
  ScreenTimeBodySchema,
} from "../schemas/screen-time.js";
import { listCharactersForChild } from "../services/achievementService.js";
import {
  activateChildProfile,
  type ChildProfileDto,
  createChildProfile,
  deleteChildProfile,
  listChildProfiles,
  toChildProfileDto,
  updateChildProfile,
} from "../services/childProfileService.js";
import { getDashboardSummary } from "../services/dashboardService.js";
import { getLearningMinutes } from "../services/learningTimeService.js";
import {
  getScreenTimeSetting,
  saveScreenTimeSetting,
  toScreenTimeSettingResponse,
} from "../services/screenTimeService.js";
import { getWeeklyReports } from "../services/weeklyReportService.js";

/**
 * `/api/children` — the parent's own learner profiles (FR-PROF-01..07).
 *
 * Every route here is scoped by the session and nothing else: there is no
 * parent-id parameter anywhere on this router, and `loadOwnedChild` answers 404
 * rather than 403 for somebody else's child, so the API leaks no information
 * about profiles the caller does not own (NFR-SAFE-02).
 *
 * ## Which verbs the PIN gates, and why the split is not arbitrary
 *
 * **Writes are gated** (`requirePinVerified`). Creating, editing and above all
 * deleting a profile are parent-dashboard actions, and deleting one destroys a
 * child's entire learning history (FR-PROF-06). FR-AUTH-04 makes the PIN the
 * boundary in front of that, and a boundary enforced only by the browser is not
 * one: the client's modal is what stops a child, and this is what stops everything
 * else. Defence in depth is the whole point — the two are not redundant.
 *
 * **Reads and `activate` are not gated**, and must never be. The Student Portal
 * calls both: `GET /` populates the profile picker and `POST /:id/activate` scopes
 * the session to whoever is playing. FR-AUTH-06 exists precisely so a five-year-old
 * handing the tablet to a sibling never meets a parental gate, so gating either
 * would break the surface this product is for. The consequence is stated plainly:
 * sibling first names and ages are readable by anyone holding the device, which is
 * inherent to a profile picker a child has to be able to use.
 */
export const childrenRouter = Router();

childrenRouter.use(requireParent);

childrenRouter.post(
  "/",
  // A parent must have accepted the COPPA consent before a child profile may
  // exist (FR-AUTH-03). Creation is the only verb gated this way: the other
  // routes read or amend a profile that consent already covers.
  requireConsent,
  // Reachable during onboarding because `POST /api/parent/pin` opens the grant
  // as it stores the PIN — see `setParentPin`.
  requirePinVerified,
  validate({ body: CreateChildBodySchema }),
  async (req, res, next) => {
    try {
      const { parent } = authContext(req);
      const body: CreateChildBody = req.body;
      const child = await createChildProfile(parent.id, body);

      const payload: SuccessEnvelope<ChildProfileDto> = {
        data: toChildProfileDto(child),
      };
      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

childrenRouter.get("/", async (req, res, next) => {
  try {
    const { parent } = authContext(req);
    const children = await listChildProfiles(parent.id);

    const payload: SuccessEnvelope<ChildProfileDto[]> = {
      data: children.map(toChildProfileDto),
    };
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

childrenRouter.get(
  "/:id",
  validate({ params: ChildIdParamsSchema }),
  loadOwnedChild,
  (req, res) => {
    const payload: SuccessEnvelope<ChildProfileDto> = {
      data: toChildProfileDto(ownedChild(req)),
    };
    res.json(payload);
  },
);

/**
 * FR-GAM-05 — the avatars this child may wear, and the ones still to earn.
 *
 * The parent's edit form needs this and `GET /api/characters` cannot answer it:
 * that endpoint lists the starter set with no child in scope, so a character the
 * child has *unlocked* never appears in it — and `PATCH /:id` would have accepted
 * it. The two ends of `avatarCharacterId` agree again here, because this is the
 * same condition `assertAvatarIsSelectable` applies.
 *
 * Not PIN-gated, matching the reads beside it: it is a list of characters, and
 * the write it feeds is gated.
 */
childrenRouter.get(
  "/:id/characters",
  validate({ params: ChildIdParamsSchema }),
  loadOwnedChild,
  async (req, res, next) => {
    try {
      const characters = await listCharactersForChild(ownedChild(req).id);

      const payload: SuccessEnvelope<{
        characters: CharacterUnlockResponse[];
      }> = { data: { characters } };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * FR-DASH-02 — how long this child has actually learned, in one window.
 *
 * On this router rather than one of its own because the resource *is* a child's:
 * the ownership guard, the 404 for somebody else's profile and the id parameter are
 * already here, and `GET /:id/characters` above set the precedent for a read about
 * a child that is not the profile row itself.
 *
 * **Every minute here is derived server-side from `SessionEvent` rows the server
 * timestamped** (FR-TIME-06). There is no counter a client increments and no field
 * anywhere that carries a duration, so a child cannot shorten a figure by
 * refreshing and a parent cannot be shown a number the device made up.
 *
 * Not PIN-gated, matching the other reads on this router. It reports minutes and
 * nothing about what was learned; the dashboard that renders it (file 29) is behind
 * the client-side gate FR-AUTH-04 asks for.
 */
childrenRouter.get(
  "/:id/learning-time",
  validate({ params: ChildIdParamsSchema, query: LearningTimeQuerySchema }),
  loadOwnedChild,
  async (req, res, next) => {
    try {
      const { range } = validatedQuery<LearningTimeQuery>(res);
      const learningTime = await getLearningMinutes(ownedChild(req).id, range);

      const payload: SuccessEnvelope<LearningTimeResponse> = {
        data: learningTime,
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * FR-DASH-01..04 — the whole parent dashboard for one child, in one request.
 *
 * On this router for the reason `/:id/learning-time` gives: the resource is a
 * child's, and the ownership guard, the 404 for somebody else's profile and the id
 * parameter are already here. (A deviation from the implementation file, which
 * suggested a router of its own — that would have meant a second mount point for
 * `/api/children` and a second copy of `requireParent`, for one route.)
 *
 * **One endpoint rather than four.** Minutes, subject progress and the activity
 * feed are read together every time the screen opens, and four PIN-gated calls
 * would be four chances for a lapsed grant to leave half a dashboard rendered.
 *
 * **PIN-gated**, unlike `/:id/learning-time` beside it. That route reports minutes
 * and nothing else; this one reports what a child has and has not learned, which
 * is the household's private record and exactly what FR-AUTH-04 puts the parental
 * gate in front of. It is also the screen a child would most like to edit the
 * story of.
 *
 * Every figure is derived server-side: minutes from `SessionEvent` density
 * (FR-TIME-06), completion from `LessonProgress`, the feed from `LessonProgress`
 * and `RewardLedger`. Nothing here can be moved by a request.
 */
childrenRouter.get(
  "/:id/dashboard",
  requirePinVerified,
  validate({ params: ChildIdParamsSchema }),
  loadOwnedChild,
  async (req, res, next) => {
    try {
      const summary = await getDashboardSummary(ownedChild(req));

      const payload: SuccessEnvelope<DashboardData> = { data: summary };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * FR-DASH-05..06 — this child's weekly reports, newest first.
 *
 * On this router for the reason `/:id/dashboard` gives, and a deviation from the
 * implementation file's suggested `routes/reports.ts` for the same reason: the
 * resource is a child's, and the ownership guard, the 404 for somebody else's
 * profile and the id parameter are already here. A router of its own would have
 * meant a second `/api/children` mount point and a second copy of `requireParent`
 * for one route.
 *
 * **Generation happens here, on read.** If the most recently finished week has no
 * row, it is aggregated before the list is returned — the free tier has no worker
 * and no queue, so the first parent to look is one of the two triggers (the other
 * is `POST /api/admin/jobs/weekly-reports`). Both are upserts on
 * `(childId, weekStart)`, so neither can duplicate a week however often they run,
 * and neither reaches back past the week the profile was created. One week of
 * catch-up per request, deliberately: a parent returning after a long gap gets last
 * week's card immediately rather than waiting on a dozen aggregations, and the cron
 * job fills the older holes.
 *
 * **PIN-gated**, like `/:id/dashboard` and for the same reason: a report says what
 * a child did and did not learn, which is the household's private record and
 * exactly what FR-AUTH-04 puts the parental gate in front of.
 *
 * `GET` rather than `POST`, though it may write: what it writes is derived from
 * rows the server already holds, it is idempotent, and it is invisible to the
 * caller — the response is the same list either way. A `POST` would push the
 * decision "does last week exist yet" into every client.
 */
childrenRouter.get(
  "/:id/reports",
  requirePinVerified,
  validate({ params: ChildIdParamsSchema }),
  loadOwnedChild,
  async (req, res, next) => {
    try {
      const reports = await getWeeklyReports(ownedChild(req));

      const payload: SuccessEnvelope<WeeklyReportList> = { data: reports };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * FR-TIME-01/04/05 — this child's daily limit and access window.
 *
 * On this router for the reason `/:id/learning-time` gives: the resource is a
 * child's, and the ownership guard, the 404 for somebody else's profile and the id
 * parameter are already here.
 *
 * **PIN-gated, unlike the reads beside it.** Every other `GET` on this router
 * feeds a screen a child may legitimately be looking at — the profile picker, an
 * avatar list. This one is the control a child would most like to change, so both
 * verbs sit behind the parental gate (FR-AUTH-04, FR-TIME-05). The student surface
 * reads its own allowance from `GET /api/screen-time/status`, which is scoped to
 * the session's active child and reveals nothing about anyone else's.
 *
 * A child with no row gets all-nulls rather than a 404: "no limits set" is a
 * policy, not a missing resource, and the form has no "not configured yet" branch
 * as a result.
 */
childrenRouter.get(
  "/:id/screen-time",
  requirePinVerified,
  validate({ params: ChildIdParamsSchema }),
  loadOwnedChild,
  async (req, res, next) => {
    try {
      const setting = await getScreenTimeSetting(ownedChild(req).id);

      const payload: SuccessEnvelope<ScreenTimeSettingResponse> = {
        data: toScreenTimeSettingResponse(setting),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Replaces the whole policy (FR-TIME-01, FR-TIME-04).
 *
 * `PATCH` by HTTP verb but total by body: all three fields are required and
 * nullable, so switching something off is a value the parent sends rather than a
 * key they omit. A partial body would make "clear the window" and "leave the
 * window alone" the same request.
 *
 * Upserts on the unique `childId`, so a parent's first save and their tenth are
 * one code path and a child can never end up with two policies.
 */
childrenRouter.patch(
  "/:id/screen-time",
  requirePinVerified,
  validate({ params: ChildIdParamsSchema, body: ScreenTimeBodySchema }),
  loadOwnedChild,
  async (req, res, next) => {
    try {
      const body: ScreenTimeBody = req.body;
      const setting = await saveScreenTimeSetting(ownedChild(req).id, body);

      const payload: SuccessEnvelope<ScreenTimeSettingResponse> = {
        data: setting,
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

childrenRouter.patch(
  "/:id",
  requirePinVerified,
  validate({ params: ChildIdParamsSchema, body: UpdateChildBodySchema }),
  loadOwnedChild,
  async (req, res, next) => {
    try {
      const body: UpdateChildBody = req.body;
      const child = await updateChildProfile(ownedChild(req).id, body);

      const payload: SuccessEnvelope<ChildProfileDto> = {
        data: toChildProfileDto(child),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

childrenRouter.delete(
  "/:id",
  requirePinVerified,
  validate({ params: ChildIdParamsSchema }),
  loadOwnedChild,
  async (req, res, next) => {
    try {
      await deleteChildProfile(ownedChild(req).id);

      const payload: SuccessEnvelope<{ deleted: true }> = {
        data: { deleted: true },
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Switches which child the session is acting as (FR-AUTH-06).
 *
 * Deliberately not PIN-gated: a five-year-old handing the tablet to a sibling
 * must not hit a parental gate, and the switch can only ever land on a profile
 * the already-authenticated parent owns.
 */
childrenRouter.post(
  "/:id/activate",
  validate({ params: ChildIdParamsSchema }),
  loadOwnedChild,
  async (req, res, next) => {
    try {
      const { session } = authContext(req);
      const activeChildProfileId = await activateChildProfile(
        session.id,
        ownedChild(req).id,
      );

      const payload: SuccessEnvelope<{ activeChildProfileId: string }> = {
        data: { activeChildProfileId },
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);
