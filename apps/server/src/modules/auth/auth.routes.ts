import { Router } from "express";
import { auth } from "../../config/auth.js";
import { env } from "../../config/env.js";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";
import {
  type ParentSummary,
  toParentSummary,
} from "../parent/parent.service.js";
import {
  authContext,
  requireParent,
} from "../parent/require-parent.middleware.js";

export const authRouter = Router();

type MeResponse = SuccessEnvelope<{
  parent: ParentSummary;
  activeChildProfileId: string | null;
}>;

authRouter.get("/google", async (_req, res, next) => {
  try {
    const { headers, response } = await auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL: `${env.WEB_ORIGIN}${env.PARENT_POST_LOGIN_PATH}`,
      },
      returnHeaders: true,
    });

    // Forward better-auth's OAuth `state` cookie, or every sign-in fails the callback state check.
    for (const cookie of headers.getSetCookie()) {
      res.append("set-cookie", cookie);
    }

    if (!response?.url) {
      throw new Error("better-auth returned no Google authorization URL");
    }
    res.redirect(302, response.url);
  } catch (error) {
    next(error);
  }
});

/** A new parent's first call also provisions the `Parent` row, via `requireParent`. */
authRouter.get("/me", requireParent, (req, res) => {
  const { parent, session } = authContext(req);

  const body: MeResponse = {
    data: {
      parent: toParentSummary(parent),
      // Null until `POST /api/children/:id/activate` sets it (FR-AUTH-06).
      activeChildProfileId: session.activeChildProfileId ?? null,
    },
  };
  res.json(body);
});
