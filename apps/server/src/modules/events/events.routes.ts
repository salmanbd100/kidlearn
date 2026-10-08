import type { ActivityEventResponse, HeartbeatResponse } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";
import { activeChild } from "../../shared/middleware/require-active-child.js";
import { validate } from "../../shared/middleware/validate.js";
import {
  recordActivityEvent,
  recordHeartbeat,
} from "../progress/learning-time.service.js";
import {
  type ActivityEventBody,
  ActivityEventBodySchema,
} from "./events.schema.js";

export const eventsRouter = Router();

eventsRouter.post("/heartbeat", async (req, res, next) => {
  try {
    const heartbeat = await recordHeartbeat(activeChild(req));
    const body: SuccessEnvelope<HeartbeatResponse> = { data: heartbeat };
    res.json(body);
  } catch (error) {
    next(error);
  }
});

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
