import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { requireParent } from "../middleware/require-parent.js";
import {
  type AvatarCharacter,
  listStarterAvatars,
} from "../services/characterService.js";

/** `/api/characters` — the avatars a child profile may wear (FR-PROF-02). */
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
