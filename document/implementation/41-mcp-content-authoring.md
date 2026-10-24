# 41 — Content Authoring over MCP: Bring Your Own AI

> **Estimated effort:** 14–18 hours, in three phases that each ship on their own (see Step-by-Step Plan)
> **Depends on:** 37a (the Gemini pipeline this file sits beside), 39 (CI). Phase C also needs
> 38 · provisioning — a public HTTPS API — because ChatGPT and claude.ai cannot reach `localhost`.
> **Requirement IDs:** FR-AI-01, FR-AI-02, FR-AI-03, FR-AI-07, FR-AI-08, FR-AI-09. Adds
> **FR-AI-10** (below) — add it to `document/project-requirement-details.md §5.13` first, per the
> working agreement.
> **Source:** the request to author learning content with ChatGPT, Claude or any other AI tool
> through MCP instead of a server-held Gemini API key.
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

Today every lesson, story and quiz the AI writes is written by **our** server calling **our**
Gemini key (`GEMINI_API_KEY`). That ties content quality to one model, ties throughput to Google's
free-tier quota (`AI_TEXT_JOBS_PER_DAY` defaults to **3**), and leaves admins who already pay for
ChatGPT or Claude unable to use them except by copy-pasting into the CMS forms — the
"Without Gemini" path in the admin guide, which skips the AI Queue entirely.

This file turns the API into an **MCP server**. An admin connects the AI tool they already use —
Claude (Desktop, claude.ai, Claude Code), ChatGPT, Cursor, VS Code, Codex, Gemini CLI — to
`https://api.kidlearn.net/mcp`, and asks it to write content. The tool reads our curriculum and
authoring rules through MCP tools, writes the lesson on the admin's own subscription, and submits
it through a tool that validates it against the same `packages/types` schemas the Gemini path uses.
A valid submission becomes an `AIGenerationJob` in `awaiting_review`, exactly like a Gemini job.

**Nothing about the human gate changes.** MCP tools can create drafts. No MCP tool can approve,
reject, publish, edit published content, or read anything about a parent or child. FR-AI-07 holds.

**New requirement — FR-AI-10 [MVP+]:** *An administrator may author AI content with an external AI
assistant of their choosing, connected over the Model Context Protocol. Externally authored content
is validated against the same content schemas, enters the same review queue, and is attributed to
the administrator and the client that submitted it.*

## Context & Current State

### How generation works now

```
Admin UI ──POST /api/admin/ai/generate/{lesson|story|quiz}──▶ requireAdmin
   ──▶ requireGenerationBudget (rate-guard.ts, per-bucket daily cap)
   ──▶ generators/<type>.ts   (look up topic/world, build prompt + per-request Zod schema)
   ──▶ runGenerationJob       (job row pending → generating; ≤2 model attempts; Zod parse;
                               persist in a transaction; job → awaiting_review | failed)
   ──▶ gemini-text.ts         (generateStructured: Zod → responseJsonSchema → Gemini)
```

| Piece | File | What it gives us |
| --- | --- | --- |
| Model call | `modules/admin/ai/gemini-text.ts`, `google-genai-client.ts` | Gemini only. Safety settings, thinking level, finish-reason mapping |
| Job lifecycle | `run-generation-job.ts` | Retry-with-feedback, audit record in `rawOutput`, persist transaction |
| Content shapes | `schemas/{lesson,story,quiz}.ts`, `@kidlearn/types` | Per-request Zod schemas (`localized()` builds keys from the requested languages) |
| Prompts | `prompts/{lesson,story,quiz}.ts` | `KIDLEARN_SYSTEM_PROMPT` + per-type user prompt; placeholder-asset rule |
| Persistence | `generators/*.ts` (`persistLesson`, `persistStory`, quiz persist) | Rows created as `draft`, stamped with `aiJobId` |
| Budget | `rate-guard.ts` | Per-**bucket** cap (`text`/`audio`/`image`) per app-timezone day, not per admin |
| Review | `review/*`, `ai.routes.ts` `/jobs*` | Queue, approve (publishes), reject with reason |
| Images | `gemini.ts` → `generators/illustration.ts` | `GEMINI_IMAGE_MODEL`, same key |
| Audio | `google-tts.ts` → `generators/narration.ts` | `GOOGLE_TTS_API_KEY` — **not** Gemini |

### Facts that shape the design — checked, not assumed

1. **The model is the only Gemini-specific part of text generation.** Lookups, schemas,
   placeholder rewriting, persistence and review are provider-neutral. The MCP path reuses all of
   them and replaces only "who writes the JSON".
2. **`AIGenerationJob` records neither who asked nor where the text came from.** No requester
   column, no source column. FR-AI-08 ("requests … are logged for auditability") is met today only
   because there is one source and the admin is implied. With two sources it is not.
3. **The workspace pins `zod ^3.24` (catalog).** The MCP TypeScript SDK v2
   (`@modelcontextprotocol/server`) dropped Zod 3 — a Zod-3 `inputSchema` registers silently and
   then fails the first `tools/list`. We do **not** bump Zod for this file. Tool input schemas are
   registered with `fromJsonSchema()` from the JSON Schema `zod-to-json-schema` already produces,
   and the handler validates with our own Zod 3 schemas. One source of truth, no second Zod.
4. **better-auth 1.7 moved MCP OAuth to `@better-auth/mcp`** (plus `jwt()` and `@better-auth/cimd`),
   with endpoints under `/oauth2/*` and `requireMcpAuth` as the route guard. `mcp()` *is* the OAuth
   provider for the whole auth instance — it cannot be scoped to admins by configuration, so the
   admin check lives in our verifier and our consent page.
5. **Admin sessions are capped at 12 h and never slide; `requireAdmin` refuses any admin with a
   non-credential account.** Any MCP credential must keep both properties or argue explicitly why
   not (see Requirement 4).
6. **`rejectCrossOriginWrites` passes requests with no `Origin`.** Server-to-server MCP clients
   (ChatGPT, claude.ai connectors) send none, so they are not blocked; a browser page with a foreign
   `Origin` still is. That is the DNS-rebinding protection the MCP spec asks for, already in place.
7. **`express.json` is capped at 100 KB.** A two-locale lesson with five questions is a few KB, so
   text fits. Images do not — which is why this file does not move image bytes over MCP (Out of Scope).
8. **`openapi/coverage.test.ts` walks an explicit `MOUNTS` list.** A new `/mcp` router is invisible
   to it unless added, so it can slip past the "undocumented route fails the suite" rule. We add it.
9. **Caddy proxies the whole API host** (`deploy/edge/Caddyfile`: `reverse_proxy prod-api:4000`), so
   `/mcp` and `/.well-known/*` reach Express with no edge change.
10. **Gemini's quiz-question union (12 KB, 15 levels deep) was rejected by `responseJsonSchema`.**
    MCP clients are more tolerant, but tool-schema limits differ per client and are not published
    for all of them. The design does not rely on any client accepting that schema whole.

### What MCP changes about the job lifecycle

The Gemini path *runs* a job: our server holds the request open for up to ten provider calls,
retries once on a schema failure, and reaps stranded rows (`stale-jobs.ts`). Over MCP the model
runs on the client. A submission arrives complete or not at all:

- **Invalid submission** → the tool returns `isError: true` with the flattened Zod issues. The
  client's model reads them and resubmits. That *is* the retry loop, run by the client, at no cost
  to us. Nothing is persisted.
- **Valid submission** → job row and content rows are written in **one** transaction, straight to
  `awaiting_review`. No `pending`/`generating` state, nothing for `failStaleJobs` to reap.

## Decisions

| # | Decision | Why | Rejected alternative |
| --- | --- | --- | --- |
| D1 | KidLearn is the MCP **server**; the AI tool is the MCP client | The admin's own subscription pays for the model and picks it; we hold no text-model key | Our server as an MCP client using *sampling* — no mainstream client exposes sampling to remote servers, and it would still route through one admin's session |
| D2 | Keep the Gemini path, behind an optional key | Removes nothing that works; admins without an AI subscription keep one-click generation. Deleting it is a later, separate change | Rip out Gemini in the same change — doubles the blast radius and loses the fallback |
| D3 | Stateless Streamable HTTP, `POST /mcp` only, JSON responses | One API container, no session store; better-auth 1.7's guidance is POST-only with `legacy: "reject"` | SSE / stateful sessions — nothing here streams |
| D4 | Two credential types, shipped in order: **admin access tokens** (Phase B), then **OAuth** (Phase C) | Tokens cover Claude Code, Claude Desktop config, Cursor, VS Code, Codex, Gemini CLI in a day. ChatGPT and claude.ai connectors need OAuth, which needs a public HTTPS host and a consent page | OAuth only — blocks all use on 38 · provisioning; tokens only — locks out ChatGPT and claude.ai |
| D5 | Tool input schemas via `fromJsonSchema()` + handler-side Zod 3 parse | Fact 3. Same schemas as the Gemini path, no Zod 4 alias | `zod-v4` alias per workspace — two schema dialects in one module |
| D6 | Quiz questions submitted as `{ type, … }` objects with a loose tool schema; per-format JSON Schema served by `get_quiz_format_schema` | Fact 10. Server-side Zod is the authority either way | Full union in `inputSchema` — some client will reject it |
| D7 | Narration and illustrations stay server-side, triggered by MCP tools | Chat clients do not produce TTS audio, and image bytes do not fit the transport (Fact 7) | `attach_illustration(url)` that fetches a remote image — SSRF surface; deferred |
| D8 | MCP drafts have their own per-admin daily cap, `MCP_DRAFTS_PER_DAY` | The Gemini caps protect a Google quota we no longer spend; this one protects reviewers from a flooded queue | Reuse `AI_TEXT_JOBS_PER_DAY` — 3/day would make MCP pointless |

## Detailed Requirements

### Requirement 1 — Job provenance (schema migration)

Add to `AIGenerationJob` in `packages/db/prisma/schema.prisma`:

```prisma
enum AIJobSource {
  gemini
  mcp
}

model AIGenerationJob {
  // …existing fields…
  source          AIJobSource @default(gemini)
  requestedById   String?
  requestedBy     AdminUser?  @relation("AIJobRequester", fields: [requestedById], references: [id])
  /// MCP `initialize` clientInfo — self-reported by the client, shown to reviewers, never trusted.
  client          Json?
  /// Client-chosen idempotency key; a retried tool call must not create a second draft.
  clientRequestId String?

  @@unique([requestedById, clientRequestId])
  @@index([source, requestedById, createdAt])
}
```

- The existing `reviewer` relation needs a name (`"AIJobReviewer"`) now that `AdminUser` has two.
- Existing rows default to `gemini`; `requestedById` stays null for them (we do not know).
- The Gemini routes start filling `requestedById` from `adminContext(req)` in the same change —
  closing the FR-AI-08 gap for both sources.
- `database-design.md` gets the three columns.

### Requirement 2 — Split generation from persistence

Each generator becomes three exported functions, so both paths share every line except the model call:

| Function | Lesson | Story | Quiz |
| --- | --- | --- | --- |
| `prepare*` — lookups, conflicts, builds prompt and Zod schema | topic/subject/world (`resolveWorldId`) | world | lesson, `QUIZ_PUBLISHED` guard, `buildLessonContext` |
| `persist*` — the existing transaction body | `persistLesson` | `persistStory` | quiz persist incl. the published-mid-generation re-check |
| `generate*` — Gemini path, unchanged behaviour | composes the two around `runGenerationJob` | same | same |

Add `recordSubmittedDraft()` in `modules/admin/ai/record-submitted-draft.ts`:

```ts
export async function recordSubmittedDraft<T>(options: {
  type: AIJobType;
  input: Prisma.JsonObject;        // tool arguments minus the content, plus resolved names
  submitted: unknown;              // what the client sent, verbatim, for the audit record
  parsed: T;
  requestedById: string;
  client: Prisma.JsonObject | null;
  clientRequestId?: string;
  persist: (parsed: T, jobId: string, tx: Prisma.TransactionClient) => Promise<Prisma.JsonObject>;
}): Promise<GenerationJobResult>
```

- One Serializable transaction (`withSerializationRetry`): re-check the MCP daily cap, create the
  job as `awaiting_review` with `source: "mcp"`, run `persist`, write
  `rawOutput: { submitted, entities }`. A failure rolls back both — no orphaned job row, unlike the
  Gemini path's two-step write.
- A duplicate `(requestedById, clientRequestId)` returns the **existing** job, not an error.

### Requirement 3 — The MCP server and its tools

New module `apps/server/src/modules/mcp/`:

```
mcp.routes.ts        POST /mcp, guard, per-request McpServer + transport
mcp.server.ts        buildMcpServer(principal, clientInfo) — registers tools
mcp.auth.ts          resolveMcpPrincipal(): token or OAuth JWT → AdminUser (Req. 4/5)
tools/curriculum.ts  read tools
tools/drafts.ts      submit_* tools
tools/media.ts       request_narration, request_illustrations
tools/schema.ts      toToolInputSchema(zod) → fromJsonSchema(zodToJsonSchema(...))
```

Mounted in `app.ts` **outside** `/api` (MCP clients are configured with one URL), after
`express.json`, only when `MCP_ENABLED=true`, with its own `express-rate-limit` keyed by principal.

**Tool catalogue.** Every tool reads or creates drafts; none publishes. Annotations are set so
clients can show the right confirmation UI.

| Tool | Kind | Input | Returns |
| --- | --- | --- | --- |
| `get_authoring_guide` | read | — | `KIDLEARN_SYSTEM_PROMPT`, grade labels, locales, the placeholder-asset rule, "everything you submit is reviewed by a person" |
| `list_curriculum` | read | `subjectId?` | subjects → topics (ids, names, lesson counts), worlds |
| `get_lesson` | read | `lessonId` | per-locale title + intro + narration, grade levels, quiz status, existing question summaries |
| `list_characters` | read | `worldId?` | character sheets (FR-AI-09) |
| `get_quiz_format_schema` | read | `format` | that format's JSON Schema and one valid example |
| `get_draft_status` | read | `jobId` | status, linked entity labels, the **rejection reason** if rejected |
| `list_my_drafts` | read | `status?`, `limit?` | the caller's own MCP jobs |
| `submit_lesson_draft` | write | `topicId`, `subjectId`, `gradeLevel`, `lessonFocus`, `languages`, `worldId?`, `clientRequestId?`, `lesson` | `{ jobId, status: "awaiting_review", reviewUrl }` |
| `submit_story_draft` | write | `worldId`, `gradeLevels`, `theme`, `languages`, `clientRequestId?`, `story` | same |
| `submit_quiz_questions` | write | `lessonId`, `languages`, `clientRequestId?`, `questions[]` | same |
| `request_narration` | write | `jobId` | batch ref, or `isError` if TTS is not configured |
| `request_illustrations` | write | `storyId` | batch ref, or `isError` if no image provider is configured |

`get_draft_status` returning the rejection reason is deliberate: the admin can say *"see why
draft X was rejected and fix it"* and the client resubmits — a review loop the Gemini path lacks.

**Submit-tool behaviour (all three):**

1. Resolve the principal; refuse if not a current admin (Req. 4/5).
2. Call `prepare*` with the tool arguments — same 404/409s as the REST path, returned as `isError`.
3. Parse `lesson`/`story`/`questions` with the per-request Zod schema
   (`buildLessonGenerationOutputSchema(languages)` etc.). On failure, return `isError: true` with
   `buildRetryFeedback(flatten(error))` — the same text the Gemini retry sends.
4. Enforce the question count bounds (`QUIZ_QUESTION_BOUNDS`) and that each question's `type` is in
   `QUIZ_QUESTION_TYPES`.
5. `recordSubmittedDraft(...)` with `persist*`. Placeholder rewriting (`withPlaceholderAssets`) and
   the `safeParseQuizQuestion` defence-in-depth run inside `persist*` unchanged.
6. Return `structuredContent` + a text line with the AI Queue link.

**MCP prompts.** Register `write_lesson`, `write_story`, `write_quiz` as MCP prompts that render
the existing `buildLessonUserPrompt` / `buildStoryUserPrompt` / `buildQuizUserPrompt`. Prompt and
resource support varies by client, so **every capability must also be reachable through tools** —
the prompts are a convenience, `get_authoring_guide` is the contract.

**Tool descriptions are part of the product.** Each submit tool's description states: the hard
rules from the system prompt, "call `get_authoring_guide` first", the placeholder URL rule, and
that the draft goes to human review. Keep them in `prompts/` next to the Gemini prompts so the two
cannot drift.

### Requirement 4 — Admin access tokens (Phase B)

New model `AdminAccessToken`:

```prisma
model AdminAccessToken {
  id         String    @id @default(uuid())
  adminId    String
  admin      AdminUser @relation(fields: [adminId], references: [id], onDelete: Cascade)
  name       String                 // "Claude Desktop — laptop"
  prefix     String                 // first 8 chars, shown in the UI to tell tokens apart
  tokenHash  String    @unique      // SHA-256 of the full token; the token itself is never stored
  scopes     String[]               // ["mcp:drafts"] — the only scope this file defines
  expiresAt  DateTime
  lastUsedAt DateTime?
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())

  @@index([adminId])
}
```

- Format `klat_<32 bytes base64url>`; shown **once** at creation.
- Lifetime: default 7 days, maximum 30. **This is a deliberate departure from the 12-hour admin
  session**, justified by scope: a token can read curriculum names and create drafts, nothing else.
  It cannot approve, publish, reach `/api/admin/*`, or read any parent or child data. If that
  argument is not accepted in review, cap tokens at 12 h and accept the daily re-paste.
- Every request re-checks: token not revoked or expired, `AdminUser` still exists,
  `hasNonCredentialAccount()` false. A demoted or compromised admin loses MCP access on the next call.
- Endpoints under `/api/admin/access-tokens` (`GET` list, `POST` create, `DELETE /:id` revoke),
  behind `requireAdmin`, registered in `openapi/paths/admin.ts`, response schemas in
  `packages/types/src/api/`, asserted with `assertContract`.
- Web: an "AI assistants" page in the admin CMS (`app/(admin)/admin/ai-assistants/`) listing
  tokens, creating one, revoking one, and showing copy-paste config for each client
  (Claude Code `claude mcp add --transport http …`, Claude Desktop, Cursor, VS Code). Hard-coded
  English, under the recorded `(admin)` exception in `standards/frontend.md §3`.

### Requirement 5 — OAuth for ChatGPT and claude.ai (Phase C)

- Add `@better-auth/mcp`, `@better-auth/cimd`, and `jwt()` to `config/auth.ts`:
  `mcp({ loginPage, consentPage, resource: env.MCP_RESOURCE_URL })`,
  `cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" })`. Leave unauthenticated
  dynamic client registration **off** (the 1.7 default); CIMD covers current clients. Verify at
  implementation time whether ChatGPT's connector still requires DCR — if it does, that is a
  decision to bring back, not to make silently.
- Run better-auth's migration for its OAuth tables; generate the Prisma schema changes with the
  better-auth CLI and review them like any other migration.
- **Login page:** the existing homepage admin dialog (`?signin=admin`). It must carry the OAuth
  authorise query through sign-in and resume the flow afterwards. Today it redirects to the CMS.
- **Consent page:** new `app/(admin)/admin/oauth/consent/`. Shows client name (from CIMD), the
  requested scope in plain words ("create drafts for review; cannot publish"), approve/deny.
  Server-side, it refuses any signed-in user who is not an admin — `mcp()` cannot be told to (Fact 4).
- **Verifier** (`mcp.auth.ts`): `requireMcpAuth(auth, handler, { requiredScopes: ["mcp:drafts"] })`,
  then map `sub` → `AdminUser` and apply the same checks as Requirement 4.
- **Session cap:** access tokens ≤ 1 h. Refresh tokens must not let an OAuth grant outlive the
  12-hour cap on the admin's sign-in — enforce in the verifier from the grant's `auth_time` (or the
  refresh token's issue chain). Confirm which claim better-auth exposes before writing it; if none
  does, set the refresh token lifetime to 12 h and record that.
- Protected-resource metadata at `/.well-known/oauth-protected-resource/mcp` on the API origin;
  authorisation-server metadata as better-auth serves it. Both mounted at the root, not under `/api`.
- `WEB_ORIGIN`/`BETTER_AUTH_URL` are unchanged; the authorise endpoint lives under `/api/auth/`,
  which `rejectCrossOriginWrites` already exempts.

### Requirement 6 — Gemini becomes optional

- `env.ts`: `GEMINI_API_KEY` → `.optional()`. Add `isGeminiConfigured(env)`.
- `/api/admin/ai/generate/{lesson,story,quiz,illustrations}` return
  `503 AI_PROVIDER_NOT_CONFIGURED` without it (narration depends on TTS, not Gemini — unchanged).
- New `GET /api/admin/ai/capabilities` →
  `{ geminiText, geminiImage, narration, mcp: { enabled, oauth } }`. The web hides or disables the
  Generate dialogs from it and points to the AI assistants page instead. Registered in OpenAPI.
- `vitest.setup.ts` keeps setting the key so existing suites are unaffected; one new suite runs with
  it unset.

### Requirement 7 — Review queue shows provenance

- `review/job.ts` DTOs gain `source`, `requestedBy` (name), `client` (`{ name, version }`).
- The AI Queue list and detail show "Written by Claude Desktop 1.x via MCP · requested by <admin>"
  vs "Generated by Gemini". The client name is labelled as self-reported.
- Approve/reject behave identically for both sources.

### Requirement 8 — Environment and configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MCP_ENABLED` | `false` | Mounts `/mcp` and the token endpoints |
| `MCP_RESOURCE_URL` | `${BETTER_AUTH_URL}/mcp` | Canonical resource for OAuth audience checks; must be HTTPS in production |
| `MCP_OAUTH_ENABLED` | `false` | Phase C switch |
| `MCP_DRAFTS_PER_DAY` | `30` | Per-admin cap on MCP drafts, app-timezone day |
| `MCP_RATE_LIMIT_PER_MINUTE` | `60` | Per-principal request limit on `/mcp` |

Update `.env.example`, `deploy/app/compose.yml`, the SSM parameter list in
`document/deployment/05-aws-storage-secrets-images.md`, and `vitest.setup.ts`.

### Requirement 9 — Safety and data boundaries

- **No child or parent data reaches an external AI.** MCP tools read only curriculum, worlds,
  characters, quizzes and the caller's own jobs. A test imports every tool module and asserts none
  touches `child`, `parent`, `progress*`, `session` or `account` delegates on the Prisma stub.
- **Lost provider-side safety filter.** Gemini runs with `BLOCK_LOW_AND_ABOVE` on every harm
  category. External clients apply their own, unconfigurable policies. Human review was always the
  hard gate (FR-AI-07); it is now also the *only* KidLearn-controlled gate for MCP content. The
  review UI's provenance label (Req. 7) exists so reviewers know which kind they are reading.
- **Prompt injection.** `get_lesson` returns admin-authored text to the client's model. Low risk
  (admins wrote it), but tool results are wrapped as data, never as instructions to the model.
- **Audit (FR-AI-08).** Every valid submission is a job row with the verbatim payload. Invalid
  submissions are not persisted; they are logged (`logger.info`, admin id, tool, issue count — no
  payload) so abuse is visible without filling the queue.

## Technical Approach & Suggestions

### Architecture

```
 ┌───────────────────────┐          ┌──────────────── api.kidlearn.net ────────────────┐
 │ Claude / ChatGPT /    │  HTTPS   │ Caddy ─▶ Express                                  │
 │ Cursor / VS Code …    │─────────▶│   POST /mcp ─▶ mcpRateLimit ─▶ resolveMcpPrincipal │
 │ (admin's subscription │  Bearer  │                 │  (klat_ token | OAuth JWT)       │
 │  runs the model)      │◀─────────│                 ▼                                  │
 └───────────────────────┘          │   buildMcpServer(principal) ── tools               │
          │  OAuth (Phase C)        │     read  → prisma (curriculum only)               │
          ▼                         │     submit→ prepare* → Zod parse →                 │
 kidlearn.net/?signin=admin         │             recordSubmittedDraft → persist*        │
 kidlearn.net/admin/oauth/consent   │             → AIGenerationJob (awaiting_review)   │
                                    │   /api/admin/ai/jobs*  ← AI Queue (unchanged gate) │
                                    └────────────────────────────────────────────────────┘
```

### Sketch of the route

```ts
// modules/mcp/mcp.routes.ts
export const mcpRouter = Router();

mcpRouter.post("/mcp", mcpRateLimit, async (req, res, next) => {
  try {
    const principal = await resolveMcpPrincipal(req); // 401 with WWW-Authenticate on failure
    const server = buildMcpServer(principal);
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => void server.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    next(error);
  }
});
```

`GET`/`DELETE /mcp` answer `405`. Verify the v2 package names and `createMcpHandler` signature
against the SDK at implementation time — the v2 API moved twice during 2026.

### Sketch of a submit tool

```ts
server.registerTool(
  "submit_lesson_draft",
  {
    title: "Submit a lesson for review",
    description: SUBMIT_LESSON_DESCRIPTION, // prompts/mcp.ts
    inputSchema: toToolInputSchema(SubmitLessonToolSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  async (args) => {
    const context = await prepareLesson(args);
    const parsed = buildLessonGenerationOutputSchema(args.languages).safeParse(args.lesson);
    if (!parsed.success) return toolError(buildRetryFeedback(flatten(parsed.error)));
    const result = await recordSubmittedDraft({ type: "lesson", parsed: parsed.data, persist: … });
    return draftSubmitted(result);
  },
);
```

`args` is typed from the Zod 3 schema via `z.infer`, and re-parsed by it at the top of the handler
— `fromJsonSchema`'s AJV pass is a first filter, not the authority.

### Client setup the docs must cover

| Client | Phase | Credential |
| --- | --- | --- |
| Claude Code | B | `claude mcp add --transport http kidlearn https://api.kidlearn.net/mcp --header "Authorization: Bearer klat_…"` |
| Claude Desktop | B (config) / C (connector) | token in config, or OAuth custom connector |
| claude.ai | C | custom connector, OAuth |
| ChatGPT | C | connector (developer mode / apps), OAuth |
| Cursor, VS Code, Codex CLI, Gemini CLI | B | HTTP server entry with an `Authorization` header |

UI paths in these products change often; the admin guide links each vendor's own MCP docs rather
than reproducing screenshots.

## Step-by-Step Plan

### Phase A — Foundations (4–5 h, no user-visible change)

1. Add FR-AI-10 to `project-requirement-details.md §5.13`; add this file's row to the tracker.
2. Migration: `AIJobSource`, `requestedById`, `client`, `clientRequestId`, relation names (Req. 1).
   Gemini routes start recording `requestedById`.
3. Split each generator into `prepare*` / `persist*` / `generate*` (Req. 2). Existing generator
   suites must pass **unchanged** — that is the proof the refactor is behaviour-neutral.
4. `recordSubmittedDraft` + `MCP_DRAFTS_PER_DAY` guard, TDD. `*.db.test.ts` for the transaction
   rollback and the `(requestedById, clientRequestId)` unique.
5. `GEMINI_API_KEY` optional, `capabilities` endpoint, `503 AI_PROVIDER_NOT_CONFIGURED` (Req. 6).

### Phase B — MCP server with access tokens (6–7 h)

6. Add `@modelcontextprotocol/server` and `@modelcontextprotocol/node` to `apps/server` (pnpm,
   pinned). Check the bundle/boot cost; lazy-import as `google-genai-client.ts` does if it is large.
7. `AdminAccessToken` migration, service, `/api/admin/access-tokens` routes + OpenAPI + contract
   tests (Req. 4).
8. `modules/mcp/` — route, principal resolution, read tools, submit tools, media tools (Req. 3).
   Add `/mcp` to `openapi/paths/mcp.ts` (one `POST` operation, new `MCP` tag in an `x-tagGroups`
   group) and to `coverage.test.ts`'s `MOUNTS`.
9. Review DTOs + AI Queue provenance (Req. 7).
10. Admin "AI assistants" page: token CRUD + per-client config snippets, English-only (Req. 4).
11. Manual end-to-end with Claude Code against `localhost:4000/mcp`: write a lesson, a story, a
    quiz; submit one broken payload and watch the client correct it; approve in the AI Queue;
    confirm the lesson renders in the Student Portal.

### Phase C — OAuth connectors (4–6 h, after 38 · provisioning)

12. `@better-auth/mcp` + `cimd` + `jwt()`; better-auth OAuth tables migration (Req. 5).
13. Sign-in dialog resumes the authorise flow; consent page; admin-only enforcement.
14. Verifier, scope, 12-hour grant cap.
15. Enable on `api.dev.kidlearn.net` first. Connect claude.ai and ChatGPT; run step 11 again
    through each. Then production.

### Phase D — Documentation (1 h, folded into B and C)

16. Admin guide: replace "Without Gemini" with "Use your own AI assistant"
    (`features/admin/guide/`, `site` namespace keys in `en` + `bn`); `admin-account-guide.md`;
    `runbook.md` (revoking tokens, disabling MCP); `database-design.md`; this tracker's Shared
    Technical Decisions "AI providers" bullet. Run `/sync-docs`.

## Decisions taken during implementation

Recorded so the next engineer can tell a choice from an accident. Where the code and the text above
disagree, this list is the newer word.

| # | Where the spec said | What was built, and why |
| --- | --- | --- |
| I1 | D3: `legacy: "reject"` | `legacy: "stateless"`. Rejecting 2025-era clients would lock out every assistant not yet on the 2026-07-28 revision; stateless serving keeps D3's "no session store". Their `clientInfo` arrives only at `initialize`, so `User-Agent` stands in for the provenance label |
| I2 | Req. 6: capabilities `{ …, mcp: { enabled, oauth } }` | Also `mcp.url` and `mcp.draftsPerDay` — the AI assistants page needs the URL for its config snippets and shows the cap. `oauth` is hard-coded `false` and `MCP_OAUTH_ENABLED` does not exist yet: both arrive with Phase C |
| I3 | Req. 4: `prefix` "first 8 chars" | 12: `klat_` plus seven secret characters. Eight would be `klat_` plus three, too few to tell tokens apart |
| I4 | Req. 3: rate limit "keyed by principal" | Keyed by admin id, so several tokens share one allowance. Plus a ceiling of 10 active tokens per admin (`409` past it) |
| I5 | Req. 3: `request_illustrations(storyId)` | Only for a story one of the caller's own MCP drafts created, and not once it is published. Without it a draft-only token could spend the shared image budget on any story |
| I6 | Req. 1: "the Gemini routes start filling `requestedById`" | All five generate routes and both MCP media tools do. Media jobs an assistant triggers stay `source: gemini` (Gemini or Cloud TTS wrote them, and they must keep counting against those budgets) with `requestedById` set |
| I7 | Req. 2: `rawOutput: { submitted, entities }` | `{ submitted, parsed, entities }`. `readParsedLesson` and `readCharacterDescriptions` read `parsed`, as they do for Gemini jobs |
| I8 | Req. 2: duplicate `clientRequestId` returns the existing job | Checked before `prepare*`, so a retry is answered even after the quiz was published. An id already used for a *different* type is a tool error, not that job |
| I9 | Testing: "Unit (Prisma stubbed, citing §5)" | Overridden by `general.md §5` ("No new stubbed suite is written"): the no-Gemini suite is `ai.routes.no-gemini.db.test.ts` |
| I10 | AC: existing route suites pass "without edits to their assertions" | Five `toHaveBeenCalledWith` assertions in `ai.routes.test.ts` gained the `{ requestedById }` argument the routes now pass — the signature changed, the behaviour asserted did not. `seed-admin.test.ts` widened one whitespace match after Prisma re-aligned `AdminUser`'s columns |
| I11 | Phase D 16: *replace* "Without Gemini" | Added "Use your own AI assistant" beside it. D2 keeps the Gemini path, so admins still using it keep its instructions |
| I12 | Step 6: check boot cost | Measured during review: ~15 MB RSS and ~60 ms with the SDK imported eagerly; not large enough to lazy-load, so `app.ts` imports it statically |
| I13 | Req. 8: `MCP_*` in `deploy/app/compose.yml` | SSM parameters instead. Compose's `environment:` overrides the SSM-written `env_file`, and `deploy.sh` rewrites `compose.env` on every deploy, so a key listed in compose could never be turned on (`runbook.md` "AI assistants over MCP") |
| I14 | Req. 3: `request_narration(jobId)` | Only while the caller's draft is `awaiting_review`, and a quiz draft voices only the questions it added (`questionIds`). The audio cap is checked once across the lesson intro and its quiz. The I5 reasoning applied to narration: a draft-only token must not spend the shared audio budget on rejected, live or other people's content |
| I15 | Sketch: submit tools `idempotentHint: true` | `false`. `clientRequestId` stays optional, so a client retrying a call sent without one on the strength of the hint would write a second draft |
| I16 | Sketch: "`fromJsonSchema`'s AJV pass is a first filter" | Switched off for tools: the SDK answered a bad call before the handler ran, so Req. 9's invalid-submission log never saw it. The advertised JSON Schema is unchanged; `parseArgs` is the only check. Prompts keep the SDK's pass |
| I17 | Req. 4: "a demoted or compromised admin loses MCP access on the next call" | Also on a password rotation: `seed:admin` revokes the admin's tokens with their sessions, since a token minted from a session the leaked password opened would otherwise outlive the rotation |

## Acceptance Criteria

- [ ] `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm --filter server test:db` green
      locally, and `gates` green on the PR.
- [ ] All existing generator and route suites pass without edits to their assertions.
- [ ] With `GEMINI_API_KEY` unset the server boots, `/generate/*` returns `503`, and the web hides
      the Generate dialogs.
- [ ] `tools/list` over MCP returns exactly the tools in Requirement 3, each with a non-empty
      description and an input schema that is valid JSON Schema.
- [ ] A valid `submit_lesson_draft` creates one `AIGenerationJob` (`source: mcp`, `requestedById`
      set, `awaiting_review`) plus draft `Lesson`/`Quiz`/`QuizQuestion` rows stamped with its id.
- [ ] An invalid submission returns `isError: true` with path-level issues and writes no row.
- [ ] Re-sending the same `clientRequestId` returns the same `jobId`.
- [ ] A revoked, expired, or parent-owned credential gets `401`/`403`; an admin with a linked
      Google account gets `403`.
- [ ] No MCP tool can change a row's `status` to `approved` or `published` — asserted by test.
- [ ] The data-boundary test (Req. 9) passes.
- [ ] `MCP_DRAFTS_PER_DAY` is enforced per admin and does not consume the Gemini text budget.
- [ ] AI Queue shows source and requester for both kinds of job.
- [ ] Phase B manual check (step 11) recorded on the PR.
- [ ] Phase C: a lesson authored from ChatGPT and one from claude.ai reach the AI Queue on
      `api.dev.kidlearn.net`, recorded on the PR.

## Testing

- **Unit (Prisma stubbed, citing `general.md §5`):** principal resolution, each submit tool's
  validation → error mapping, `toToolInputSchema` output, capability flags.
- **`*.db.test.ts`:** `recordSubmittedDraft` rollback when `persist` throws; idempotency unique;
  token revocation takes effect on the next call; per-admin cap under concurrent submissions.
- **MCP integration:** drive the router through Supertest with `@modelcontextprotocol/client`
  (or raw JSON-RPC bodies): `initialize` → `tools/list` → `tools/call`. Assert results with Zod
  schemas in `packages/types/src/api/mcp.ts`.
- **Contract:** token endpoints and `capabilities` through `assertContract`.
- **Web:** AI assistants page (create shows the token once, revoke removes it), consent page
  refuses non-admins, AI Queue provenance badge.

## Risks

| Risk | Mitigation |
| --- | --- |
| Client models produce weaker Bangla than the prompt demands | Unchanged rule: a fluent reviewer reads `bn` before approval. Provenance label tells them which model wrote it |
| MCP SDK v2 API churn | Pin exact versions; the route is ~30 lines and isolated in `modules/mcp/` |
| Long-lived tokens leak | Short default lifetime, draft-only scope, per-request admin re-check, revocation UI, `lastUsedAt` shown |
| Reviewers flooded by an enthusiastic assistant | Per-admin daily cap; `list_my_drafts` lets the client see what is already queued |
| better-auth OAuth provider opens a flow for parents | Consent page and verifier both refuse non-admins; test covers it |
| Tool schemas rejected by a particular client | D6 keeps schemas shallow; server-side Zod is authoritative |

## Out of Scope

- Removing the Gemini code path or its env vars (a follow-up once MCP has been used for real).
- Moving image or audio bytes over MCP; `attach_illustration(url)` with remote fetching.
- Any MCP tool that approves, rejects, publishes, edits published content, or deletes.
- Video (FR-AI-06).
- An MCP surface for parents or the Student Portal.
- Bumping the workspace to Zod 4 (`/upgrade-dependency zod` is its own change).
- Billing or usage reporting for the admin's external AI spend.

## Open Questions for Review

1. **Token lifetime** — accept 7-day default / 30-day max for draft-only tokens, or hold to 12 h?
2. **Images without Gemini** — keep `GEMINI_API_KEY` for illustrations only, or accept manual
   upload as the only image path once text moves to MCP?
3. **Dynamic client registration** — if ChatGPT's connector still needs DCR, do we enable
   authenticated DCR, or wait for CIMD support?
