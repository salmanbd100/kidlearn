import { Router } from "express";
import type { SuccessEnvelope } from "../../../shared/errors/errors.js";
import { adminContext } from "../../../shared/middleware/require-admin.js";
import { validate } from "../../../shared/middleware/validate.js";
import {
  AccessTokenIdParamsSchema,
  CreateAdminAccessTokenSchema,
} from "./access-tokens.schema.js";
import {
  type AdminAccessTokenDto,
  createAccessToken,
  listAccessTokens,
  revokeAccessToken,
} from "./access-tokens.service.js";

export const accessTokensRouter = Router();

accessTokensRouter.get("/", async (req, res, next) => {
  try {
    const payload: SuccessEnvelope<{ tokens: AdminAccessTokenDto[] }> = {
      data: { tokens: await listAccessTokens(adminContext(req).id) },
    };
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

accessTokensRouter.post(
  "/",
  validate({ body: CreateAdminAccessTokenSchema }),
  async (req, res, next) => {
    try {
      const payload: SuccessEnvelope<{
        token: AdminAccessTokenDto;
        secret: string;
      }> = {
        data: await createAccessToken(adminContext(req).id, req.body),
      };
      // The secret is in this body and nowhere else, so nothing between here and the browser may keep it.
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

accessTokensRouter.delete(
  "/:id",
  validate({ params: AccessTokenIdParamsSchema }),
  async (req, res, next) => {
    try {
      const payload: SuccessEnvelope<AdminAccessTokenDto> = {
        data: await revokeAccessToken(
          adminContext(req).id,
          // Guarded by `validate({ params: AccessTokenIdParamsSchema })` above.
          req.params.id as string,
        ),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);
