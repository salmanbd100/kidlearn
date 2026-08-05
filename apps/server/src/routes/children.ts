import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { loadOwnedChild, ownedChild } from "../middleware/load-owned-child.js";
import { requireConsent } from "../middleware/require-consent.js";
import { authContext, requireParent } from "../middleware/require-parent.js";
import { validate } from "../middleware/validate.js";
import {
  ChildIdParamsSchema,
  type CreateChildBody,
  CreateChildBodySchema,
  type UpdateChildBody,
  UpdateChildBodySchema,
} from "../schemas/children.js";
import {
  activateChildProfile,
  type ChildProfileDto,
  createChildProfile,
  deleteChildProfile,
  listChildProfiles,
  toChildProfileDto,
  updateChildProfile,
} from "../services/childProfileService.js";

/**
 * `/api/children` — the parent's own learner profiles (FR-PROF-01..07).
 *
 * Every route here is scoped by the session and nothing else: there is no
 * parent-id parameter anywhere on this router, and `loadOwnedChild` answers 404
 * rather than 403 for somebody else's child, so the API leaks no information
 * about profiles the caller does not own (NFR-SAFE-02).
 */
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

childrenRouter.patch(
  "/:id",
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
