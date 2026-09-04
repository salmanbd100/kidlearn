import { Router } from "express";
import { auth } from "../lib/auth.js";
import { env } from "../lib/env.js";
import type { SuccessEnvelope } from "../lib/errors.js";
import { authContext, requireParent } from "../middleware/require-parent.js";
import {
  type ParentSummary,
  toParentSummary,
} from "../services/parentService.js";

/** Routes that live *alongside* better-auth's own handler. */
export const authRouter = Router();

type MeResponse = SuccessEnvelope<{
  parent: ParentSummary;
  activeChildProfileId: string | null;
}>;

/** Starts the Google round-trip (FR-AUTH-02). */
authRouter.get("/google", async (_req, res, next) => {
  try {
    const { headers, response } = await auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL: `${env.WEB_ORIGIN}${env.PARENT_POST_LOGIN_PATH}`,
      },
      returnHeaders: true,
    });

    // better-auth sets an OAuth `state` cookie on these headers and verifies it
    // on the callback. Dropping it here would make every sign-in fail the state
    // check, so forward the headers before redirecting.
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

/**
 * The client's "who am I" call. Also the endpoint that provisions the `Parent`
 * row on a brand-new parent's first request, via `requireParent`.
 */
authRouter.get("/me", requireParent, (req, res) => {
  const { parent, session } = authContext(req);

  const body: MeResponse = {
    data: {
      parent: toParentSummary(parent),
      // Which child the session is currently acting as (FR-AUTH-06). Null until
      // `POST /api/children/:id/activate` sets it in file 11.
      activeChildProfileId: session.activeChildProfileId ?? null,
    },
  };
  res.json(body);
});
