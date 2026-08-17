import type { CharacterUnlockResponse } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { loadOwnedChild, ownedChild } from "../middleware/load-owned-child.js";
import { requireConsent } from "../middleware/require-consent.js";
import { authContext, requireParent } from "../middleware/require-parent.js";
import { requirePinVerified } from "../middleware/require-pin-verified.js";
import { validate } from "../middleware/validate.js";
import {
  ChildIdParamsSchema,
  type CreateChildBody,
  CreateChildBodySchema,
  type UpdateChildBody,
  UpdateChildBodySchema,
} from "../schemas/children.js";
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
