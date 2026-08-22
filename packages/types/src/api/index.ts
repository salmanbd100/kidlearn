/**
 * HTTP contracts for the kidlearn API.
 *
 * Request validation already lives next to the routes that run it. This
 * directory is the **response** half, which previously existed only as
 * TypeScript types inside `apps/server/src/services` — unreachable for the web
 * app and unusable for generating documentation.
 *
 * Three rules hold across every file here:
 *
 *  - Timestamps are `IsoDateTimeSchema`, never `z.date()`. The wire format is a
 *    string even where the service's type says `Date`.
 *  - These schemas describe responses; they do not police them. Nothing parses an
 *    outgoing body at runtime. They are consumed by the OpenAPI document
 *    (`apps/server/src/openapi/`) and asserted in the route tests, which is where
 *    drift surfaces.
 *  - No dependency on `@kidlearn/db`. Prisma enums are mirrored, with a
 *    compile-time check on the server side that the mirror still matches.
 */

export * from "./auth.js";
export * from "./children.js";
export * from "./content.js";
export * from "./dashboard.js";
export * from "./envelope.js";
export * from "./errors.js";
export * from "./health.js";
export * from "./learning-time.js";
export * from "./parent.js";
export * from "./progress.js";
export * from "./reports.js";
export * from "./rewards.js";
export * from "./screen-time.js";
export * from "./stories.js";
