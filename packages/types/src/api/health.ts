import { z } from "zod";
import { ok } from "./envelope.js";

/** Liveness endpoints. Database-free (NFR-PERF-04): hosts poll `/health` to keep the instance warm while the database sleeps. */

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
