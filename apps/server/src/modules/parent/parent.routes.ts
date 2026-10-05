import { Router } from "express";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";
import { validate } from "../../shared/middleware/validate.js";
import {
  confirmAccountDeletion,
  requestAccountDeletion,
} from "./account-deletion.service.js";
import { ConsentSchema, DeleteAccountSchema } from "./parent.schema.js";
import { recordParentConsent } from "./parent-consent.service.js";
import { authContext, requireParent } from "./require-parent.middleware.js";

export const parentRouter = Router();

parentRouter.use(requireParent);

// Re-parsing recovers the type (`req.body` is `any` and we do not cast); `validate` has already rejected bad input.

type ConsentResponse = SuccessEnvelope<{
  consentGivenAt: Date;
  consentVersion: string;
}>;
type DeleteRequestResponse = SuccessEnvelope<{
  confirmationToken: string;
  expiresAt: Date;
}>;
type DeleteResponse = SuccessEnvelope<{ deleted: true }>;

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

/** The confirmation token is the whole guard on erasure: single-use, expires in 15 minutes. Issuing one is harmless. */
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

/** Irreversible, synchronous erasure of the parent and all child data (NFR-SAFE-05/06), guarded by the confirmation token. */
parentRouter.delete(
  "/account",
  validate({ body: DeleteAccountSchema }),
  async (req, res, next) => {
    try {
      const { parent } = authContext(req);
      const { confirmationToken } = DeleteAccountSchema.parse(req.body);

      await confirmAccountDeletion(parent, confirmationToken);

      // The `User` and its `Session` rows are gone, so the caller's cookie no longer resolves.
      const body: DeleteResponse = { data: { deleted: true } };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);
