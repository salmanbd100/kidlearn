import { Router } from "express";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";
import { requireParent } from "../parent/require-parent.middleware.js";
import {
  type AvatarCharacter,
  listStarterAvatars,
} from "./characters.service.js";

export const charactersRouter = Router();

charactersRouter.use(requireParent);

charactersRouter.get("/", async (_req, res, next) => {
  try {
    const characters = await listStarterAvatars();

    const body: SuccessEnvelope<AvatarCharacter[]> = { data: characters };
    res.json(body);
  } catch (error) {
    next(error);
  }
});
