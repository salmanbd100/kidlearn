import { z } from "zod";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * The administrator surface (file 31, spec §4.3, FR-CMS-01/07).
 *
 * A principal of its own, not a parent with extra rights: an admin has no
 * children, no PIN and no consent record, and nothing on these paths takes a
 * parent or child id. Files 32–37 add the CMS resources; this file holds only the
 * identity call the shell needs and the platform counters.
 */

/**
 * The signed-in admin, as the sidebar footer and `AdminGuard` see them.
 *
 * Three fields and no more. `role` is deliberately absent: there is exactly one
 * flat admin role at MVP, so publishing the column would invite a client to
 * branch on a distinction the server does not yet make.
 */
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
 *
 * **Platform totals, never per-child data.** Every figure here is an aggregate
 * over the whole deployment, which is what makes the page safe to show an
 * internal reviewer who has no relationship with any household: there is no name,
 * no id and no row on this response for anybody to be identified by.
 *
 * `lessonsCompletedThisWeek` and `dauToday` are windowed in `APP_TIMEZONE`, from
 * the same `learningTimeWindow` the parent dashboard uses, so the platform's idea
 * of "today" cannot drift from a household's.
 *
 * Detailed analytics — per-subject usage, retention curves, charts — are Phase 2.
 */
export const PlatformOverviewSchema = z
  .object({
    totalParents: z.number().int().min(0),
    totalChildren: z.number().int().min(0),
    /** Completions whose `completedAt` falls in the current local Monday-start week. */
    lessonsCompletedThisWeek: z.number().int().min(0),
    /** Distinct children with at least one session event today, locally. */
    dauToday: z.number().int().min(0),
    /**
     * When the counters were read.
     *
     * Present because the page has a refresh button and nothing else on it moves:
     * without a timestamp a reviewer cannot tell a quiet platform from a stale tab.
     */
    generatedAt: IsoDateTimeSchema,
  })
  .strict();

export type PlatformOverview = z.infer<typeof PlatformOverviewSchema>;

export const PlatformOverviewResponseSchema = ok(PlatformOverviewSchema);
export type PlatformOverviewResponse = z.infer<
  typeof PlatformOverviewResponseSchema
>;
