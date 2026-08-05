import { z } from "zod";
import { ok } from "./envelope.js";

/**
 * Liveness endpoints. Deliberately database-free (NFR-PERF-04) — free-tier hosts
 * poll `/health` to keep the instance warm, so it must answer while the database
 * is asleep.
 */

export const ServiceIdentitySchema = z.object({ name: z.string() }).strict();

export const HealthSchema = z
  .object({
    status: z.literal("ok"),
    /** Process uptime in seconds, fractional. */
    uptime: z.number().nonnegative(),
  })
  .strict();

export const ServiceIdentityResponseSchema = ok(ServiceIdentitySchema);
export const HealthResponseSchema = ok(HealthSchema);
