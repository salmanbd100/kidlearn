import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { authContext, requireParent } from "../middleware/require-parent.js";
import { requirePinVerified } from "../middleware/require-pin-verified.js";
import { validate } from "../middleware/validate.js";
import {
  ConsentSchema,
  DeleteAccountSchema,
  SetPinSchema,
  VerifyPinSchema,
} from "../schemas/parent.js";
import {
  confirmAccountDeletion,
  requestAccountDeletion,
} from "../services/accountDeletionService.js";
import {
  type GateStatus,
  readGateStatus,
  recordParentConsent,
  setParentPin,
  verifyParentPinForSession,
} from "../services/parentSecurityService.js";

/**
 * `/api/parent` — the parent's own account: PIN, consent, deletion.
 *
 * `requireParent` guards the whole router. `requirePinVerified` is applied
 * per-route rather than router-wide, because the PIN and consent routes cannot
 * require a PIN grant without a chicken-and-egg deadlock: you would need to
 * verify a PIN in order to set your first one. Everything that acts on the
 * account itself (deletion) does sit behind the gate.
 *
 * Later parent-dashboard and settings routes (files 28–30) mount here behind
 * `requirePinVerified`.
 */
export const parentRouter = Router();

parentRouter.use(requireParent);

// Each handler below re-parses `req.body` with the same schema `validate`
// already applied. `validate` is what rejects bad input at the boundary (the
// request never reaches the handler); the second parse only recovers the type,
// because `req.body` is `any` and this codebase does not cast. The schemas are
// four small fields — the cost is noise-level.

type PinSetResponse = SuccessEnvelope<{ hasPin: true }>;
type PinVerifyResponse = SuccessEnvelope<{ pinVerifiedUntil: Date }>;
type ConsentResponse = SuccessEnvelope<{
  consentGivenAt: Date;
  consentVersion: string;
}>;
type DeleteRequestResponse = SuccessEnvelope<{
  confirmationToken: string;
  expiresAt: Date;
}>;
type DeleteResponse = SuccessEnvelope<{ deleted: true }>;
type GateStatusResponse = SuccessEnvelope<GateStatus>;

/**
 * Whether the parent area is open right now (FR-AUTH-04).
 *
 * Deliberately **not** behind `requirePinVerified` — a gate cannot be asked
 * whether it is shut from the far side of itself. It is also why this route
 * exists at all: without it a client's only way to learn the state of the gate is
 * to call a PIN-gated endpoint and read the 403, and the only PIN-gated endpoint
 * is "request account deletion", which mints a deletion token as a side effect.
 *
 * Reads only what `requireParent` already loaded, so it costs no query and
 * answers while the database is asleep (NFR-PERF-04).
 */
parentRouter.get("/gate-status", (req, res) => {
  const { parent, session } = authContext(req);

  const body: GateStatusResponse = { data: readGateStatus(parent, session) };
  res.json(body);
});

/**
 * Sets the parental PIN, or replaces it when `currentPin` proves possession
 * (FR-AUTH-04). Deliberately not behind `requirePinVerified`: a parent with no
 * PIN could never get through the gate to create their first one.
 */
parentRouter.post(
  "/pin",
  validate({ body: SetPinSchema }),
  async (req, res, next) => {
    try {
      const { parent } = authContext(req);
      const { pin, currentPin } = SetPinSchema.parse(req.body);

      await setParentPin(parent, pin, currentPin);

      // Only ever the fact that a PIN exists — never the PIN or its hash.
      const body: PinSetResponse = { data: { hasPin: true } };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);

/** Opens the 15-minute parent-area grant on this session (FR-AUTH-04). */
parentRouter.post(
  "/pin/verify",
  validate({ body: VerifyPinSchema }),
  async (req, res, next) => {
    try {
      const { parent, session } = authContext(req);
      const { pin } = VerifyPinSchema.parse(req.body);

      const grant = await verifyParentPinForSession(parent, session.id, pin);

      const body: PinVerifyResponse = { data: grant };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Records COPPA consent (FR-AUTH-03). Not PIN-gated: consent is normally the
 * very first thing a new parent does, before any PIN exists.
 */
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
 * Step one of account deletion (FR-AUTH-05). PIN-gated: this is the most
 * destructive action in the product, so it must not be reachable from a
 * session someone left open on the kitchen tablet.
 *
 * The token is returned in the response for the MVP. When email confirmation
 * lands, only this handler changes — the `DELETE` contract stays identical.
 */
parentRouter.post(
  "/account/delete-request",
  requirePinVerified,
  async (req, res, next) => {
    try {
      const { parent } = authContext(req);

      const request = await requestAccountDeletion(parent.id);

      const body: DeleteRequestResponse = { data: request };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Step two: irreversible, synchronous erasure of the parent, every child
 * profile and all of their data (NFR-SAFE-05/06). Guarded by the confirmation
 * token rather than by `requirePinVerified` — the token was itself issued
 * behind the PIN gate and expires in 15 minutes.
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
