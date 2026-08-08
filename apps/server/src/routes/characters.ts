import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { requireParent } from "../middleware/require-parent.js";
import {
  type AvatarCharacter,
  listStarterAvatars,
} from "../services/characterService.js";

/**
 * `/api/characters` — the avatars a child profile may wear (FR-PROF-02).
 *
 * This router exists because `avatarCharacterId` on `POST /api/children` is a
 * `Character` row id, and nothing else on the API let a client discover one. The
 * profile form cannot hold a static list: the ids are generated when the
 * characters are seeded, and the set of published starter characters is content,
 * managed from the CMS (file 31) rather than compiled into the web app.
 *
 * Not PIN-gated. A parent reaches the profile form during onboarding, before any
 * PIN exists, so gating this would deadlock the first-run flow the same way
 * gating `/api/parent/pin` would.
 */
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
