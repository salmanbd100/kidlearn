/** `@kidlearn/types` — the single source of truth for versioned content payloads. */

// Fixtures ship from the package root by design: the content seed and AI prompt examples reuse them.
export * from "./__fixtures__/activities.js";
export * from "./__fixtures__/quiz.js";
export * from "./activity/parse.js";
export * from "./activity/schemas.js";
// HTTP contracts, shared with `apps/web` so the client never redeclares a response shape.
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
export * from "./domain/badges.js";
export * from "./domain/concepts.js";
export * from "./domain/learning-time.js";
export * from "./domain/locale.js";
// Shared because the reducer in `apps/web` and the monotonic guard in `apps/server` must walk the same step array.
export * from "./domain/progress.js";
export * from "./domain/screen-time.js";
export * from "./primitives.js";
export * from "./quiz/evaluate.js";
export * from "./quiz/parse.js";
export * from "./quiz/schemas.js";
