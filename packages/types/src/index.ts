/**
 * `@kidlearn/types` — the single source of truth for versioned content payloads.
 *
 * The frontend renderers, the backend validators, and the AI generation prompts
 * all import from here. Nothing in this package may depend on `@kidlearn/db`,
 * Prisma, Express, or React: it is pure schema, usable on both sides of the wire.
 *
 * The additive versioning rule for `schemaVersion` is documented in
 * `./primitives` — read it before changing any schema.
 */

// Fixtures ship from the package root by design: the content seed script
// (file 12) and the AI prompt examples (file 34) reuse the valid payloads.
export * from "./__fixtures__/activities.js";
export * from "./__fixtures__/quiz.js";
export * from "./activity/parse.js";
export * from "./activity/schemas.js";
// HTTP request/response contracts (file 12a). Shared with `apps/web` so the
// client never redeclares a response shape.
export * from "./api/index.js";
// Badge rules as data (file 24 engine, file 33 CMS form): one definition of what
// `streak_days` takes, read by the evaluator, the admin API and the form.
export * from "./badges.js";
// The concept-token prefixes stored on a lesson (file 30): written by the admin
// editor, bucketed by the report aggregator, rendered as chips by the parent
// screen — one vocabulary, three consumers.
export * from "./concepts.js";
// Server-derived learning time (file 27): the activity-event and range
// vocabulary both halves of the wire share.
export * from "./learning-time.js";
export * from "./primitives.js";
// The lesson-flow vocabulary (file 16): step order, resume arithmetic, and the
// two request contracts the player posts. Shared because the reducer in
// `apps/web` and the monotonic guard in `apps/server` must walk the same array.
export * from "./progress.js";
export * from "./quiz/parse.js";
export * from "./quiz/schemas.js";
// Parental screen-time control (file 28): the limit/window vocabulary the parent
// form validates against and the server enforces from.
export * from "./screen-time.js";
