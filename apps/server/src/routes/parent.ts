import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { authContext, requireParent } from "../middleware/require-parent.js";
import { validate } from "../middleware/validate.js";
import { ConsentSchema, DeleteAccountSchema } from "../schemas/parent.js";
import {
  confirmAccountDeletion,
  requestAccountDeletion,
} from "../services/accountDeletionService.js";
import { recordParentConsent } from "../services/parentConsentService.js";

/** `/api/parent` — the parent's own account: consent and deletion. */
export const parentRouter = Router();

parentRouter.use(requireParent);

// Each handler below re-parses `req.body` with the same schema `validate`
// already applied. `validate` is what rejects bad input at the boundary (the
// request never reaches the handler); the second parse only recovers the type,
// because `req.body` is `any` and this codebase does not cast. The schemas are
// two small fields — the cost is noise-level.

type ConsentResponse = SuccessEnvelope<{
  consentGivenAt: Date;
  consentVersion: string;
}>;
type DeleteRequestResponse = SuccessEnvelope<{
  confirmationToken: string;
  expiresAt: Date;
}>;
type DeleteResponse = SuccessEnvelope<{ deleted: true }>;

/** Records COPPA consent (FR-AUTH-03). */
parentRouter.post(
  "/consent",
  validate({ body: ConsentSchema }),
  async (req, res, next) => {
    try {
      const { parent } = authContext(req);
      const { version } = ConsentSchema.parse(req.body);

      const record = await recordParentConsent(parent, version);

      const body: ConsentResponse = { data: record };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Step one of account deletion (FR-AUTH-05). The confirmation token this mints
 * is the whole guard on erasure: it is single-use, expires in 15 minutes, and
 * `DELETE /account` does nothing without it. Issuing one is itself harmless.
 */
parentRouter.post("/account/delete-request", async (req, res, next) => {
  try {
    const { parent } = authContext(req);

    const request = await requestAccountDeletion(parent.id);

    const body: DeleteRequestResponse = { data: request };
    res.json(body);
  } catch (error) {
    next(error);
  }
});

/**
 * Step two: irreversible, synchronous erasure of the parent, every child
 * profile and all of their data (NFR-SAFE-05/06). Guarded by the confirmation
 * token, which is single-use and expires in 15 minutes.
 */
parentRouter.delete(
  "/account",
  validate({ body: DeleteAccountSchema }),
  async (req, res, next) => {
    try {
      const { parent } = authContext(req);
      const { confirmationToken } = DeleteAccountSchema.parse(req.body);

      await confirmAccountDeletion(parent, confirmationToken);

      // The better-auth `User` row is gone, and its `Session` rows with it, so
      // the cookie the caller still holds no longer resolves to anything.
      const body: DeleteResponse = { data: { deleted: true } };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);
