/**
 * `@kidlearn/types` — the single source of truth for versioned content payloads.
 */

// Fixtures ship from the package root by design: the content seed script
// (file 12) and the AI prompt examples (file 34) reuse the valid payloads.
export * from "./__fixtures__/activities.js";
export * from "./__fixtures__/quiz.js";
export * from "./activity/parse.js";
export * from "./activity/schemas.js";
// HTTP request/response contracts (file 12a). Shared with `apps/web` so the
// client never redeclares a response shape.
export * from "./api/admin.js";
export * from "./api/admin-ai.js";
export * from "./api/admin-content.js";
export * from "./api/admin-editors.js";
export * from "./api/admin-media.js";
export * from "./api/auth.js";
export * from "./api/children.js";
export * from "./api/content.js";
export * from "./api/dashboard.js";
export * from "./api/envelope.js";
export * from "./api/errors.js";
export * from "./api/health.js";
export * from "./api/learning-time.js";
export * from "./api/parent.js";
export * from "./api/progress.js";
export * from "./api/reports.js";
export * from "./api/rewards.js";
export * from "./api/screen-time.js";
export * from "./api/stories.js";
// Badge rules as data (file 24 engine, file 33 CMS form): one definition of what
// `streak_days` takes, read by the evaluator, the admin API and the form.
export * from "./domain/badges.js";
// The concept-token prefixes stored on a lesson (file 30): written by the admin
// editor, bucketed by the report aggregator, rendered as chips by the parent
// screen — one vocabulary, three consumers.
export * from "./domain/concepts.js";
// Server-derived learning time (file 27): the activity-event and range
// vocabulary both halves of the wire share.
export * from "./domain/learning-time.js";
// The lesson-flow vocabulary (file 16): step order, resume arithmetic, and the
// two request contracts the player posts. Shared because the reducer in
// `apps/web` and the monotonic guard in `apps/server` must walk the same array.
export * from "./domain/progress.js";
// Parental screen-time control (file 28): the limit/window vocabulary the parent
// form validates against and the server enforces from.
export * from "./domain/screen-time.js";
export * from "./primitives.js";
export * from "./quiz/evaluate.js";
export * from "./quiz/parse.js";
export * from "./quiz/schemas.js";
