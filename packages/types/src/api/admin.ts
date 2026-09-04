import { z } from "zod";
import { IsoDateTimeSchema, ok } from "./envelope.js";

// The administrator surface (file 31, spec §4.3, FR-CMS-01/07).

/** The signed-in admin, as the sidebar footer and `AdminGuard` see them. */
export const AdminIdentitySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
  })
  .strict();

export type AdminIdentity = z.infer<typeof AdminIdentitySchema>;

export const AdminIdentityResponseSchema = ok(AdminIdentitySchema);
export type AdminIdentityResponse = z.infer<typeof AdminIdentityResponseSchema>;

/**
 * The four numbers the admin analytics page renders (FR-CMS-07, basic tier).
 */
export const PlatformOverviewSchema = z
  .object({
    totalParents: z.number().int().min(0),
    totalChildren: z.number().int().min(0),
    /** Completions whose `completedAt` falls in the current local Monday-start week. */
    lessonsCompletedThisWeek: z.number().int().min(0),
    /** Distinct children with at least one session event today, locally. */
    dauToday: z.number().int().min(0),
    /** When the counters were read. */
    generatedAt: IsoDateTimeSchema,
  })
  .strict();

export type PlatformOverview = z.infer<typeof PlatformOverviewSchema>;

export const PlatformOverviewResponseSchema = ok(PlatformOverviewSchema);
export type PlatformOverviewResponse = z.infer<
  typeof PlatformOverviewResponseSchema
>;
