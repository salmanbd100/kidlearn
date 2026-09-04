# 37a — Free-Tier AI Provider Migration

> **Estimated effort:** 3–4 hours
> **Depends on:** 34, 35, 36 (introduces every client this file replaces). Land before 38 —
> a metered key would dwarf that file's fixed ~$23/month infrastructure bill.
> **Requirement IDs:** none directly — this is an infra/cost decision, not a new FR, on the
> same footing as file 38a. It protects FR-AI-01..06/08 (behaviour is unchanged) and is what
> keeps the deployment's running cost predictable.
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

File 38 puts KidLearn on AWS for a **fixed** ~$23/month, but files 34–36 wired the AI pipeline to
two metered, pay-as-you-go APIs: Anthropic Claude for every text generator (FR-AI-01..03) and
ElevenLabs for narration (FR-AI-04). Neither has a free tier that survives real use — Claude has
none at all, and ElevenLabs' free allowance is a few minutes of audio a month, which a single
story with bilingual narration can exhaust. Deploying file 38 as written means the AI Queue is
the one feature standing between a predictable bill and an unbounded one, from the moment an
admin uses it.

This file swaps both for providers with a genuinely usable free tier, **without touching
`runGenerationJob`, any route, or any downstream schema**. Both `claude.ts` and `elevenlabs.ts`
were already built as narrow, swappable boundaries — `generateStructured(...)` returns
`{ raw, usage, stopReason?, refusal? }` and `generateNarration(text, locale)` returns a `Buffer`
— so this is a same-shape client replacement, not a rewrite:

- **Text (lesson/story/quiz generators):** Claude → **Gemini**, reusing the `GEMINI_API_KEY`
  already in the codebase for illustrations (file 36). One Google AI Studio key now covers both
  text and images — one fewer paid account to hold, not just a cheaper one.
- **Narration:** ElevenLabs → **Google Cloud Text-to-Speech**, whose free tier (4,000,000
  characters/month for Standard voices as of the current pricing page — **re-verify at
  <https://cloud.google.com/text-to-speech/pricing> before relying on it, quotas change**) is
  large enough that a small platform is unlikely to exceed it.
- **Illustrations stay on Gemini, unchanged.** File 36 already chose a free-tier-friendly
  provider here; this file only adds a caution to re-check its current quota alongside the
  text-model quota (both draw from the same key and the same account-level rate limits).

## Context & Current State

`services/ai/claude.ts` exports `generateStructured({ system, messages, toolName, outputSchema })`
using Anthropic tool-use to force schema-shaped JSON. `services/ai/run-generation-job.ts` is the
provider-agnostic orchestrator every generator shares — it calls `options.generate(retryFeedback?)`,
`safeParse`s the result, retries once on a schema miss, and imports `GenerationStopReason` **from
`claude.ts`** to tell a refusal or a token-ceiling cutoff apart from an ordinary invalid answer
(`describeUnretryableStop`, which fails the job immediately instead of burning a pointless retry).
That import is the one place `run-generation-job.ts` knows Claude exists, and it has to move.

`services/ai/generators/lesson.ts`, `story.ts`, and `quiz.ts` each build a `messages` array of
**only `role: "user"` turns** — the retry feedback is appended as a second user message, not as
an `assistant` turn (`lesson.ts`'s own comment explains why: echoing the model's rejected answer
back as an assistant turn would double-bill tokens to restate what the feedback already quotes).
That turns out to matter here: because no call site ever uses a `"model"`/`"assistant"` role, the
message-building code in all three generators needs **no change at all** — only the import path
and the now-Gemini-specific option shape change.

`services/ai/elevenlabs.ts` exports `generateNarration(text, locale): Promise<Buffer>` — a single
`fetch`, no SDK, called from exactly one place: `generators/narration.ts`'s `runNarrationJob`,
which pipes the buffer straight into `uploadBuffer`. Nothing else references it.

`services/ai/gemini.ts` (file 36) already solves the one hard problem a Gemini client here would
otherwise re-solve: the `@google/genai` SDK costs ~10 seconds to import (protobufjs + the Google
auth stack), so its `getClient()` lazily imports and memoises a `GoogleGenAI` instance rather than
constructing one at module load, keeping that cost off the server's boot path (NFR-PERF-04). This
file extracts that helper into a shared module so the new text client reuses it instead of paying
the import cost a second time.

`apps/server/src/lib/env.ts` requires `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default
`claude-sonnet-5`), `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID_EN`, `ELEVENLABS_VOICE_ID_BN` — all
five go away. `GEMINI_API_KEY` and `GEMINI_IMAGE_MODEL` already exist and are unchanged.

`document/project-requirement-details.md`'s technology table names `ElevenLabs (multi-language)`
for "AI — audio" with no "(free tier)" qualifier — unlike the `Database` and `Media hosting` rows
right above and below it, both of which are explicitly scoped to their free tiers. The "AI —
text/quizzes" row already just says "LLMs → JSON payloads" — it never named Claude, so swapping
the text provider needs no requirements-doc change at all, only the audio row does.

## Detailed Requirements

1. **Shared lazy Gemini client (`services/ai/google-genai-client.ts`, new file).** Move
   `gemini.ts`'s `getClient()`/`clientPromise` here verbatim — same lazy-import, same
   reject-without-memoising behaviour, same doc comment about why it is lazy. Export `getClient()`.
   Update `gemini.ts` to import it instead of defining its own. This is the only change to
   `gemini.ts` — illustration generation itself does not change.

2. **Text generation provider swap (`services/ai/gemini-text.ts`, replaces `claude.ts`).**
   Same exported shape as today, minus the tool-use-specific field:
   ```ts
   export interface GenerateStructuredOptions {
     system: string;
     messages: { role: "user"; content: string }[];
     outputSchema: ZodTypeAny;
   }
   export async function generateStructured(
     options: GenerateStructuredOptions,
   ): Promise<StructuredGeneration>   // same { raw, usage, stopReason, refusal? } as today
   ```
   Internally: combine `options.messages` into Gemini `Content[]` — **one part per message,
   inside a single `role: "user"` turn** rather than one `Content` per message, so the call never
   depends on whether `generateContent` merges consecutive same-role turns the way the Anthropic
   API is documented to (it is not documented to for Gemini; don't rely on it):
   ```ts
   const contents = [
     { role: "user" as const, parts: options.messages.map((m) => ({ text: m.content })) },
   ];
   const response = await (await getClient()).models.generateContent({
     model: env.GEMINI_TEXT_MODEL,
     contents,
     config: {
       systemInstruction: options.system,
       responseMimeType: "application/json",
       responseJsonSchema: zodToJsonSchema(options.outputSchema, {
         target: "jsonSchema7",
         $refStrategy: "none",
       }),
       maxOutputTokens: MAX_OUTPUT_TOKENS,
       thinkingConfig: { thinkingBudget: 0 }, // see note below
     },
   });
   ```
   `zodToJsonSchema`'s output can be passed to `responseJsonSchema` directly — verified against the
   `@google/genai` SDK docs, which show `zodToJsonSchema(zodSchema)` used as `responseJsonSchema`
   with no conversion step. This preserves the exact "one schema, three consumers" property files
   34–35 built (FR-AI-03): the prompt's contract, the retry validator, and the renderer all still
   read `QuizQuestionSchema` from `@kidlearn/types`, unchanged.

   `thinkingConfig: { thinkingBudget: 0 }` disables Gemini's extended "thinking" for these calls.
   Structured JSON extraction does not benefit from it the way open-ended reasoning does, and
   thinking tokens count against the same free-tier rate limits as output tokens — for a
   budget-constrained deployment, spending them on invisible reasoning the schema doesn't need is
   the wrong default. **Verify output quality holds with thinking off** on a few real generations
   during Step 6 below; if lesson/story quality visibly drops, raise `thinkingBudget` rather than
   removing the config entirely (an unset thinking budget on some Flash models still reasons by
   default, silently spending more of the free tier per call than expected).

3. **Response parsing must fail like a schema miss, never like a thrown error.** This is the one
   place a naive port would introduce a real regression: `run-generation-job.ts`'s retry loop only
   *retries* a bad answer if `options.generate()` returns something that fails `schema.safeParse`
   — but if `options.generate()` *throws*, `runGenerationJob` fails the job immediately with
   **zero retries** (see its `try { generated = await options.generate(feedback) } catch { return
   fail(...) }`). Anthropic's client never throws on a merely-malformed tool call — it returns
   `raw: null`, which fails `safeParse` and gets the one retry. A naive
   `JSON.parse(response.text)` does **not** have that property: a response cut off mid-JSON (e.g.
   by hitting `MAX_TOKENS`) throws a `SyntaxError` out of `JSON.parse`, which would silently burn
   the one retry this pipeline is supposed to give the model. Catch it:
   ```ts
   let raw: unknown = null;
   try { raw = response.text ? JSON.parse(response.text) : null; }
   catch { raw = null; } // malformed/truncated JSON is a schema failure, not a thrown error
   ```

4. **Map Gemini's `finishReason` onto the existing `stopReason`/`refusal` contract.**
   `run-generation-job.ts`'s `describeUnretryableStop` special-cases `"refusal"` and
   `"max_tokens"`/`"model_context_window_exceeded"` to fail a job by name instead of retrying it —
   the whole point being an audit trail that says *why* a generation didn't finish (FR-AI-08).
   Gemini's taxonomy is different (`candidates[0].finishReason`: `STOP`, `MAX_TOKENS`, `SAFETY`,
   `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII`, `RECITATION`, ...; plus a top-level
   `promptFeedback.blockReason` when the *prompt itself* was blocked before any candidate
   generated). Map the ones this codebase already acts on; leave everything else as a normal
   completion (the `default` branch already treats an unmapped reason as retryable, which is
   correct for `STOP`):
   ```ts
   function mapFinishReason(response: GenerateContentResponse) {
     if (response.promptFeedback?.blockReason) {
       return { stopReason: "refusal" as const, refusal: `prompt blocked: ${response.promptFeedback.blockReason}` };
     }
     const finishReason = response.candidates?.[0]?.finishReason;
     switch (finishReason) {
       case "MAX_TOKENS": return { stopReason: "max_tokens" as const };
       case "SAFETY": case "PROHIBITED_CONTENT": case "BLOCKLIST": case "SPII": case "RECITATION":
         return { stopReason: "refusal" as const, refusal: `finishReason: ${finishReason}` };
       default: return {};
     }
   }
   ```

5. **Provider-neutral shared types (`services/ai/types.ts`, new file).** `TokenUsage`,
   `GenerationStopReason` (now a plain string union kept locally instead of re-exporting
   `Anthropic.StopReason`), and `StructuredGeneration` move here. `run-generation-job.ts` and
   `gemini-text.ts` both import from `types.ts` instead of `run-generation-job.ts` importing from
   `claude.ts` (which is deleted). No other change to `run-generation-job.ts` — its retry loop,
   audit trail, and transaction handling are provider-agnostic already and stay exactly as they
   are.

6. **Narration provider swap (`services/ai/google-tts.ts`, replaces `elevenlabs.ts`).** Same
   plain-`fetch`, same exported signature — `generators/narration.ts` needs **only its import
   line changed**:
   ```ts
   export async function generateNarration(text: string, locale: Locale): Promise<Buffer> {
     const voice = VOICE_BY_LOCALE[locale]; // { languageCode, name } per locale, from env
     const response = await fetch(
       `https://texttospeech.googleapis.com/v1/text:synthesize?key=${env.GOOGLE_TTS_API_KEY}`,
       {
         method: "POST",
         headers: { "content-type": "application/json" },
         body: JSON.stringify({
           input: { text },
           voice: { languageCode: voice.languageCode, name: voice.name },
           audioConfig: { audioEncoding: "MP3" },
         }),
       },
     );
     if (!response.ok) {
       throw new Error(`Google TTS ${response.status}: ${await response.text()}`.trim());
     }
     const { audioContent } = (await response.json()) as { audioContent: string };
     return Buffer.from(audioContent, "base64");
   }
   ```
   Google's `text:synthesize` REST endpoint returns base64 audio in a JSON envelope, not raw bytes
   like ElevenLabs — the `Buffer.from(audioContent, "base64")` step is the one real shape
   difference `generators/narration.ts` never has to know about, because it stays inside this
   file.

7. **Voice configuration.** Standard voices, not WaveNet/Neural2 — the free tier for Standard is
   an order of magnitude larger, and "child-friendly, warm, unhurried" (file 36's own bar) is
   achievable on a Standard voice. Env: `GOOGLE_TTS_API_KEY`, `GOOGLE_TTS_VOICE_EN` (default
   `en-US-Standard-C`), `GOOGLE_TTS_VOICE_BN` (default `bn-IN-Standard-A`). Derive `languageCode`
   from the voice name's own locale prefix (`en-US`, `bn-IN`) rather than a second env var — the
   voice name already encodes it, and a mismatched pair (an `en-US` code with a `bn-IN` voice name)
   would be a config error worth failing loudly on rather than silently accepting two
   independently-wrong values. Document in `.env.example`, exactly as files 36's ElevenLabs
   comment did, that picking the actual voices is an administrator's listening decision — list
   `gcloud text-to-speech voices list --language-code=bn-IN` (and `en-US`) as how to browse
   options.

8. **Getting a `GOOGLE_TTS_API_KEY` without a service-account file.** This project's other
   credentials are all plain strings (`env.ts`'s existing pattern), not a service-account JSON
   path — keep that. In Google Cloud Console: create a project (or reuse the one backing
   `GEMINI_API_KEY` if it's a Cloud project rather than a bare AI Studio key), enable the "Cloud
   Text-to-Speech API," create an **API key** under Credentials, and restrict it to that one API.
   **This does require attaching a billing account to the Google Cloud project**, even though
   usage inside the free tier is billed $0 — Cloud Console will not issue the key otherwise. If
   that's a hard blocker (no card to attach anywhere), see the Appendix for a card-free fallback;
   don't silently ship a worse voice to avoid documenting the tradeoff.

9. **Env changes.** Remove from `lib/env.ts` and `.env.example`: `ANTHROPIC_API_KEY`,
   `ANTHROPIC_MODEL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID_EN`, `ELEVENLABS_VOICE_ID_BN`.
   Add: `GEMINI_TEXT_MODEL` (default `gemini-2.5-flash` — a tuning knob, same reasoning
   `ANTHROPIC_MODEL` and `GEMINI_IMAGE_MODEL` already carry in their doc comments), `GOOGLE_TTS_API_KEY`
   (required, same "fails at boot" reasoning as every other credential in this file), `GOOGLE_TTS_VOICE_EN`,
   `GOOGLE_TTS_VOICE_BN` (both defaulted, per requirement 7). `GEMINI_API_KEY` and
   `GEMINI_IMAGE_MODEL` are untouched — one key, two models, two jobs.

10. **Lower the daily job caps, and say why.** `AI_TEXT_JOBS_PER_DAY` (default 50),
    `AI_AUDIO_JOBS_PER_DAY` (default 200), `AI_IMAGE_JOBS_PER_DAY` (default 100) were sized against
    a paid Claude account's rate limits, not a free tier's. Google AI Studio's free tier enforces
    its own per-minute and per-day request caps on `gemini-2.5-flash`, and they are tighter than
    these defaults in most published free-tier configurations. Don't hardcode a specific number
    here — **check <https://ai.google.dev/gemini-api/docs/rate-limits> for the current free-tier
    limits for the chosen model before setting these**, and size `AI_TEXT_JOBS_PER_DAY` and
    `AI_IMAGE_JOBS_PER_DAY` (they share the same underlying account quota) comfortably under the
    daily figure so `rate-guard.ts`'s cap trips before Google's does — a 429 with `RATE_LIMITED`
    and a clear message is a far better admin experience than an opaque provider-side quota error
    surfacing through `runGenerationJob`'s generic failure path.

11. **Dependency cleanup.** Remove `@anthropic-ai/sdk` from `apps/server/package.json` — nothing
    imports it once `claude.ts` is deleted. `@google/genai` and `zod-to-json-schema` are already
    present and now serve every generator, text and image alike.

12. **Tests.** `services/ai/gemini-text.test.ts` (replaces `claude`-specific assertions, if any
    existed as a standalone client test — file 34 didn't list one, only `run-generation-job.test.ts`
    and the generator tests, which mock `generate`/the client): assert the JSON-parse-never-throws
    behaviour from requirement 3 (a truncated `response.text` yields `raw: null`, not a thrown
    error), and the `finishReason` mapping from requirement 4 for `MAX_TOKENS` and one `SAFETY`-family
    reason. `services/ai/google-tts.test.ts` (mocked `fetch`, replaces `elevenlabs.test.ts`):
    `bn` locale hits the `bn-IN` voice name and language code, base64 response decodes to the
    expected `Buffer`, non-OK response throws with the provider's body included. Update the mock
    import target (not the assertions) in `generators/lesson.test.ts`, `story.test.ts`,
    `quiz.test.ts`, and `narration.test.ts` — every one of them mocks the client module by path;
    only the path and the mock's return shape (no more `stopReason`/`refusal` fields need
    fabricating unless a test specifically exercises requirement 4) change.

## Technical Approach & Suggestions

Files to create:

```
apps/server/src/services/ai/google-genai-client.ts   # getClient(), moved out of gemini.ts
apps/server/src/services/ai/types.ts                 # TokenUsage, GenerationStopReason, StructuredGeneration
apps/server/src/services/ai/gemini-text.ts           # generateStructured() — replaces claude.ts
apps/server/src/services/ai/gemini-text.test.ts
apps/server/src/services/ai/google-tts.ts            # generateNarration() — replaces elevenlabs.ts
apps/server/src/services/ai/google-tts.test.ts
```

Files to delete:

```
apps/server/src/services/ai/claude.ts
apps/server/src/services/ai/elevenlabs.ts
apps/server/src/services/ai/elevenlabs.test.ts
```

Files to edit (import path / mock target only, per requirements 2, 5, 6, 12 — no logic changes):

```
apps/server/src/services/ai/gemini.ts                   # use the extracted getClient()
apps/server/src/services/ai/run-generation-job.ts       # import types from ./types.js, not ./claude.js
apps/server/src/services/ai/generators/lesson.ts        # import path + drop `toolName`
apps/server/src/services/ai/generators/lesson.test.ts   # mock target
apps/server/src/services/ai/generators/story.ts         # import path + drop `toolName`
apps/server/src/services/ai/generators/story.test.ts    # mock target
apps/server/src/services/ai/generators/quiz.ts          # import path + drop `toolName`
apps/server/src/services/ai/generators/quiz.test.ts     # mock target
apps/server/src/services/ai/generators/narration.ts     # import path only
apps/server/src/services/ai/generators/narration.test.ts # mock target
apps/server/src/lib/env.ts                              # requirement 9
apps/server/.env.example                                # requirement 9
apps/server/package.json                                # requirement 11
document/project-requirement-details.md                 # "AI — audio" row: name the new provider + "(free tier)"
document/implementation/00-progress-tracker.md          # Shared Technical Decisions: providers line
```

## Step-by-Step Plan

1. Extract `getClient()` from `gemini.ts` into `google-genai-client.ts`; update `gemini.ts` to
   import it. Run `pnpm --filter server test` to confirm illustration generation is unaffected —
   this step alone should be a no-op refactor with a green suite. (~15 min)
2. Create `types.ts` with `TokenUsage`/`GenerationStopReason`/`StructuredGeneration`; point
   `run-generation-job.ts`'s import there instead of `./claude.js`. Still green — `claude.ts`
   still exists and is untouched. (~10 min)
3. Add `GEMINI_TEXT_MODEL` to `lib/env.ts` + `.env.example`; write `gemini-text.ts` implementing
   requirements 2–4 (message combining, JSON-parse-never-throws, finish-reason mapping). Unit test
   the two failure-mode behaviours directly against a mocked SDK response — this is the part most
   likely to regress silently if skipped. (~50 min)
4. Swap `lesson.ts`, `story.ts`, `quiz.ts`: change the import to `gemini-text.js`, delete each
   file's `TOOL_NAME` constant and the `toolName:` field in its `generateStructured` call. Update
   the three generator tests' mock target. `pnpm --filter server test` on just these files. (~30 min)
5. Add `GOOGLE_TTS_API_KEY`, `GOOGLE_TTS_VOICE_EN`, `GOOGLE_TTS_VOICE_BN` to `lib/env.ts` +
   `.env.example` (with the voice-listing command from requirement 7); write `google-tts.ts` +
   `google-tts.test.ts`; swap `narration.ts`'s import and `narration.test.ts`'s mock target. (~35 min)
6. Delete `claude.ts`, `elevenlabs.ts`, `elevenlabs.test.ts`; remove `ANTHROPIC_*`/`ELEVENLABS_*`
   from `lib/env.ts` and `.env.example`; remove `@anthropic-ai/sdk` from `package.json`;
   `pnpm install`. `pnpm --filter server test` full suite. (~15 min)
7. Manual run against the **live free-tier APIs**: one lesson generation, one story generation
   (both locales), one quiz generation, one narration in each of `en`/`bn`. Listen to both audio
   clips — confirm the Bangla clip is actually the Bangla voice, not an English voice reading
   Bangla text badly (file 36's own warning about this risk applies identically here). Compare
   lesson/story output quality against a memory of pre-migration Claude output; if visibly worse,
   revisit the `thinkingConfig` note in requirement 2 before accepting the swap. (~30 min)
8. Re-check the free-tier rate-limit pages named in requirement 10 and set final
   `AI_*_JOBS_PER_DAY` defaults; update `document/project-requirement-details.md`'s "AI — audio"
   row and `00-progress-tracker.md`'s Shared Technical Decisions; `pnpm lint && pnpm typecheck`.
   (~20 min)

## Acceptance Criteria

- [ ] `pnpm --filter server test` passes with no reference to `claude.ts` or `elevenlabs.ts`
      remaining anywhere in `apps/server` (`grep -rn "claude\.js\|elevenlabs\.js" apps/server/src`
      returns nothing).
- [ ] Server refuses to boot without `GEMINI_API_KEY` or `GOOGLE_TTS_API_KEY`; it boots fine
      without any `ANTHROPIC_*` or `ELEVENLABS_*` variable set, because none is declared any more.
- [ ] A truncated/malformed Gemini JSON response is provably retried once (schema-failure path),
      never thrown as an uncaught error out of `runGenerationJob` — covered by the test from
      requirement 12, not just asserted manually.
- [ ] A Gemini response with `finishReason: "SAFETY"` (or the equivalent test double) fails the job
      immediately with `stopReason: "refusal"` and **no** second attempt — the same behaviour
      `describeUnretryableStop` already gives a Claude refusal.
- [ ] A real lesson, story, and quiz generation each complete against the live Gemini free tier and
      persist as `draft` rows exactly as before — no downstream schema, persistence, or route code
      changed, so this is a regression check, not new behaviour.
- [ ] Real narration clips exist for both `en` and `bn`, each playable, each in the correct
      language's voice (listened to, not just "the API returned 200").
- [ ] The snapshot test proving the prompt-embedded quiz JSON Schema is byte-identical to
      `zodToJsonSchema(QuizQuestionSchema)` still passes, now asserting against
      `responseJsonSchema` instead of Anthropic's `input_schema` — the "one schema, three
      consumers" invariant (FR-AI-03) survives the provider swap.
- [ ] `AI_TEXT_JOBS_PER_DAY`/`AI_IMAGE_JOBS_PER_DAY` are set below the current published Gemini
      free-tier daily request limit for the chosen models (cite the checked figure and date in the
      commit message, the way this file's own header cites its checked dates).
- [ ] `pnpm lint` and `pnpm typecheck` pass at the repo root.
- [ ] No route, request schema, response schema, or OpenAPI path definition changed —
      `openapi/coverage.test.ts` passes unmodified, because this file is entirely internal to
      `services/ai/`.
- [ ] `document/project-requirement-details.md`'s "AI — audio" row and
      `00-progress-tracker.md`'s Shared Technical Decisions name the new providers; no doc left in
      the repo still tells a reader to obtain an Anthropic or ElevenLabs key for this pipeline.

## Out of Scope

- **A pluggable multi-provider abstraction layer.** This is a direct swap of one client for
  another behind the exact same function signature, not a strategy pattern for choosing a
  provider at runtime. Nothing in this codebase's stated conventions wants a feature flag for
  "which AI vendor," and the two providers being swapped away from are not coming back.
- **Video (FR-AI-06)** — already a documented manual flow (file 36), already free of any API
  cost, untouched here.
- **Media hosting (Cloudinary)** — already free-tier-scoped in the requirements doc, not a cost
  driver this file addresses.
- **Self-hosted/offline TTS or a local LLM** as the *primary* path — see the Appendix for why
  Google Cloud TTS is recommended over them, and when the fallback is worth reconsidering.
- **Retroactively re-generating already-approved content** that was produced by Claude/ElevenLabs
  before this migration — those rows are already published or sitting in the review queue and are
  left exactly as they are.
- **Production monitoring/alerting on free-tier quota consumption** — file 38's territory, not
  this one; this file only sizes the *internal* caps sensibly against the *external* quota as it
  stands today.

## Appendix — a card-free fallback, if attaching billing to any Google Cloud project is a hard no

Requirement 8 is the one place this plan asks for something adjacent to a payment method: Google
Cloud Console will not issue an API key for the Text-to-Speech API without a billing account on
the project, even though nothing inside the free tier is ever charged. If that's genuinely not an
option — no card to attach anywhere, on principle or otherwise — the fallback is **Piper**
(open-source, neural, runs entirely offline): self-host it as a small sidecar process the server
calls over localhost instead of an external API, replacing `google-tts.ts`'s `fetch` with a call
to that sidecar, same `generateNarration(text, locale): Promise<Buffer>` signature.

Two real costs to that path, weighed honestly rather than glossed over: Piper's voice catalogue is
community-contributed and thin for `bn` (Bengali) specifically — quality and even availability of
a Bengali voice should be verified against Piper's current voice list before committing to it, and
it may be meaningfully behind Google's `bn-IN-Standard` voices; and it needs a place to run
(a small always-on process, which the "sleeps on its free tier" server this codebase targets, per
`gemini.ts`'s own NFR-PERF-04 comment, is not obviously a good host for). Treat this as the
answer if requirement 8's billing-account step is a hard blocker, not as a quality-neutral swap —
and re-open this file's Gemini text-generation half regardless, since Gemini's free tier has no
comparable billing-account requirement (an AI Studio API key needs no billing account attached).
