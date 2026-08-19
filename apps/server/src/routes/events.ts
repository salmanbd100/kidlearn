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
 *
 * Mounted in `routes/index.ts` behind `requireParent` + `requireActiveChild`, so
 * every handler here has an ownership-checked child and no path names one.
 *
 * A resource of its own rather than more paths on `/api/progress`, and the split is
 * not cosmetic: `/api/progress/*` records what happened *inside one lesson* and its
 * bodies are lesson-shaped. A heartbeat is about nothing but the child, and a story
 * event is about a surface the lesson player has never heard of. The lesson player
 * keeps posting its step detail (`step`, `fallback`) to `/api/progress/events`,
 * which this endpoint has no field for.
 */
export const eventsRouter = Router();

/**
 * FR-TIME-06 — "I am still here."
 *
 * No body, no timestamp, nothing to validate. The client's entire contribution is
 * that the request arrived; the server stamps the row, throttles the cadence, and
 * derives the minutes. That is what makes a refresh, a cleared storage or an edited
 * client state unable to lower a recorded minute.
 *
 * `200`, not `201`, even though it usually writes a row: a throttled beat writes
 * nothing, and an endpoint that answered `201` half the time would have a client
 * branching on a status code to learn what `recorded` already says.
 */
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
 *
 * `201`: the log is append-only, so a call that succeeds always creates a row.
 *
 * Unlike the heartbeat, this has no cadence floor — a short lesson fires
 * `step_complete` events seconds apart, and a floor would drop the real ones. It
 * cannot inflate a figure either way: minutes come from the span between events,
 * not their count, so a client appending in a loop buys itself rows and no time.
 * What is left is unbounded log growth, and that belongs to a rate limiter in
 * front of the whole API — this server has none on any route yet.
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
