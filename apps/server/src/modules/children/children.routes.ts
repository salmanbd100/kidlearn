import type {
  CharacterUnlockResponse,
  DashboardData,
  LearningTimeResponse,
  ScreenTimeSettingResponse,
  WeeklyReportList,
} from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";
import { requireConsent } from "../../shared/middleware/require-consent.js";
import { validate, validatedQuery } from "../../shared/middleware/validate.js";
import {
  type LearningTimeQuery,
  LearningTimeQuerySchema,
} from "../events/events.schema.js";
import {
  authContext,
  requireParent,
} from "../parent/require-parent.middleware.js";
import { getLearningMinutes } from "../progress/learning-time.service.js";
import { listCharactersForChild } from "../rewards/achievement.service.js";
import {
  type ScreenTimeBody,
  ScreenTimeBodySchema,
} from "../screen-time/screen-time.schema.js";
import {
  getScreenTimeSetting,
  saveScreenTimeSetting,
  toScreenTimeSettingResponse,
} from "../screen-time/screen-time.service.js";
import {
  activateChildProfile,
  type ChildProfileDto,
  createChildProfile,
  deleteChildProfile,
  listChildProfiles,
  readChildStats,
  toChildProfileDto,
  updateChildProfile,
} from "./child-profile.service.js";
import {
  ChildIdParamsSchema,
  type CreateChildBody,
  CreateChildBodySchema,
  type UpdateChildBody,
  UpdateChildBodySchema,
} from "./children.schema.js";
import { getDashboardSummary } from "./dashboard.service.js";
import { loadOwnedChild, ownedChild } from "./load-owned-child.middleware.js";
import { getWeeklyReports } from "./weekly-report.service.js";

/** `/api/children` — the parent's own learner profiles (FR-PROF-01..07). */
export const childrenRouter = Router();

childrenRouter.use(requireParent);

childrenRouter.post(
  "/",
  // A parent must have accepted the COPPA consent before a child profile may
  // exist (FR-AUTH-03). Creation is the only verb gated this way: the other
  // routes read or amend a profile that consent already covers.
  requireConsent,
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
    const stats = await readChildStats(children.map((child) => child.id));

    const payload: SuccessEnvelope<ChildProfileDto[]> = {
      data: children.map((child) =>
        toChildProfileDto(child, stats.get(child.id)),
      ),
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
  async (req, res, next) => {
    try {
      const child = ownedChild(req);
      const stats = await readChildStats([child.id]);

      const payload: SuccessEnvelope<ChildProfileDto> = {
        data: toChildProfileDto(child, stats.get(child.id)),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

/** FR-GAM-05 — the avatars this child may wear, and the ones still to earn. */
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

/** FR-DASH-02 — how long this child has actually learned, in one window. */
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
 */
childrenRouter.get(
  "/:id/dashboard",
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

/** FR-DASH-05..06 — this child's weekly reports, newest first. */
childrenRouter.get(
  "/:id/reports",
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

/** FR-TIME-01/04/05 — this child's daily limit and access window. */
childrenRouter.get(
  "/:id/screen-time",
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

/** Replaces the whole policy (FR-TIME-01, FR-TIME-04). */
childrenRouter.patch(
  "/:id/screen-time",
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
  validate({ params: ChildIdParamsSchema, body: UpdateChildBodySchema }),
  loadOwnedChild,
  async (req, res, next) => {
    try {
      const body: UpdateChildBody = req.body;
      const child = await updateChildProfile(ownedChild(req).id, body);
      const stats = await readChildStats([child.id]);

      const payload: SuccessEnvelope<ChildProfileDto> = {
        data: toChildProfileDto(child, stats.get(child.id)),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

childrenRouter.delete(
  "/:id",
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

/** Switches which child the session is acting as (FR-AUTH-06). */
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
