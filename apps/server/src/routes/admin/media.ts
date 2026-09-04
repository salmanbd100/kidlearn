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

/** `/api/admin/media` — the media library (file 33, FR-CMS-02). */
export const adminMediaRouter = Router();

/** The upload credential (FR-CMS-02). */
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
