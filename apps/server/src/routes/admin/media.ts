import { Router } from "express";
import type { SuccessEnvelope } from "../../lib/errors.js";
import { validate, validatedQuery } from "../../middleware/validate.js";
import {
  type MediaListQuery,
  MediaListQuerySchema,
  RegisterAssetSchema,
  SignUploadSchema,
} from "../../schemas/admin-media.js";
import {
  listAssets,
  type MediaAssetDto,
  registerAsset,
  signUploadParams,
  type UploadSignature,
} from "../../services/mediaService.js";

/**
 * `/api/admin/media` — the media library (file 33, FR-CMS-02).
 *
 * Three operations and a deliberate absence. `POST /sign` hands out an upload
 * credential, `POST /` records what came back, `GET /` lists what exists — and
 * **there is no upload endpoint**, because the file goes straight from the
 * admin's browser to Cloudinary. See `services/mediaService.ts` for why that is
 * the only shape that works on this deployment.
 *
 * The two-request dance is visible to the client and that is intentional: an
 * upload that succeeded at Cloudinary but failed to register leaves an orphan
 * file in the account rather than a row pointing at nothing. Orphans cost storage
 * and are collectable; a broken reference is content a child cannot play.
 *
 * Mounted inside `adminRouter`, so `requireAdmin` guards every path here by
 * construction.
 */
export const adminMediaRouter = Router();

/**
 * The upload credential (FR-CMS-02).
 *
 * `POST` rather than `GET` even though it reads nothing: it mints a
 * time-limited credential, so it must not be cacheable, prefetchable or
 * reachable from a link.
 */
adminMediaRouter.post(
  "/sign",
  validate({ body: SignUploadSchema }),
  (req, res, next) => {
    try {
      const payload: SuccessEnvelope<UploadSignature> = {
        data: signUploadParams(req.body.kind),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminMediaRouter.post(
  "/",
  validate({ body: RegisterAssetSchema }),
  async (req, res, next) => {
    try {
      const asset = await registerAsset(req.body);

      const payload: SuccessEnvelope<MediaAssetDto> = { data: asset };
      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminMediaRouter.get(
  "/",
  validate({ query: MediaListQuerySchema }),
  async (_req, res, next) => {
    try {
      const query = validatedQuery<MediaListQuery>(res);

      const payload: SuccessEnvelope<MediaAssetDto[]> = {
        data: await listAssets(query),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);
