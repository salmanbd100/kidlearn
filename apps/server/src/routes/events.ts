import type { ActivityEventResponse, HeartbeatResponse } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { activeChild } from "../middleware/require-active-child.js";
import { validate } from "../middleware/validate.js";
import {
  type ActivityEventBody,
  ActivityEventBodySchema,
} from "../schemas/events.js";
import {
  recordActivityEvent,
  recordHeartbeat,
} from "../services/learningTimeService.js";

/**
 * `/api/events` — the presence signal learning time is derived from (FR-TIME-06).
 */
export const eventsRouter = Router();

/** FR-TIME-06 — "I am still here." */
eventsRouter.post("/heartbeat", async (req, res, next) => {
  try {
    const heartbeat = await recordHeartbeat(activeChild(req));
    const body: SuccessEnvelope<HeartbeatResponse> = { data: heartbeat };
    res.json(body);
  } catch (error) {
    next(error);
  }
});

/**
 * One discrete thing the child did — the events that keep a sitting alive between
 * heartbeats and mark what it was spent on.
 */
eventsRouter.post(
  "/activity",
  validate({ body: ActivityEventBodySchema }),
  async (req, res, next) => {
    try {
      // `validate` replaced the body with the parsed object.
      const body: ActivityEventBody = req.body;
      const event = await recordActivityEvent(activeChild(req), body);

      const payload: SuccessEnvelope<{ event: ActivityEventResponse }> = {
        data: { event },
      };
      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  },
);
