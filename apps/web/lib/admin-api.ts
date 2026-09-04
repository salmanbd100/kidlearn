import type {
  AdminActivity,
  AdminBadge,
  AdminIdentity,
  AdminLesson,
  AdminQuiz,
  AdminQuizDetail,
  AdminQuizQuestion,
  AdminSubject,
  AdminTopic,
  AdminWorld,
  AiJobCount,
  AiJobDetail,
  AiJobList,
  AiJobStatus,
  AiJobType,
  AiReviewResult,
  AssetKind,
  BatchGenerationRef,
  CharacterSheet,
  ContentResourceName,
  ContentStatusValue,
  EditorContentResourceName,
  GenerationJobRef,
  GradeLevelValue,
  Locale,
  MediaAsset,
  NarrationEntity,
  OrderableContentResourceName,
  PlatformOverview,
  PromotedCharacterSheets,
  QuestionDeleted,
  QuizQuestionType,
  ReorderedIds,
  UploadSignature,
} from "@kidlearn/types";
import { type ApiResult, apiBaseUrl, apiFetch } from "./api-client";

/**
 * Typed wrappers over `/api/admin/*` and the two better-auth calls the CMS makes.
 *
 * Every response type is imported from `@kidlearn/types` — the same schema the
 * route tests assert real bodies against — so no shape is redeclared here
 * (`backend.md §7`). Files 32–37 extend this module rather than calling `apiFetch`
 * from a component.
 *
 * These run in the browser, not on the Next server, for the same reason
 * `parent-api.ts` does: the session cookie belongs to the API origin, so a Server
 * Component fetching `/api/admin/me` would send no credentials and get a 401.
 */

/** Who am I. `403` here means a signed-in *parent*, not a broken session. */
export function fetchAdminMe(): Promise<ApiResult<AdminIdentity>> {
  return apiFetch<AdminIdentity>("/api/admin/me");
}

/** The four platform counters (FR-CMS-07, basic tier). */
export function fetchPlatformOverview(
  options: { onColdStart?: () => void } = {},
): Promise<ApiResult<PlatformOverview>> {
  return apiFetch<PlatformOverview>("/api/admin/analytics/overview", {
    onColdStart: options.onColdStart,
  });
}

/**
 * Sign in with email and password — the only password login in the product.
 *
 * **Deliberately not `apiFetch`.** better-auth's endpoints answer with their own
 * bodies (`{ token, user }`, `{ success }`), not kidlearn's `{ data }` envelope, so
 * `apiFetch` would unwrap nothing and report `MALFORMED_RESPONSE` on a successful
 * sign-in. The retry behaviour is unwanted here too: replaying a rejected password
 * three times is how an account gets locked out once file 38 adds rate limiting.
 *
 * A wrong password and an unknown email both surface as `false` because the server
 * makes them indistinguishable on purpose — telling them apart would confirm which
 * addresses belong to administrators.
 */
export async function adminSignIn(
  email: string,
  password: string,
): Promise<{ ok: boolean }> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/auth/sign-in/email`, {
      method: "POST",
      // The session cookie is set by better-auth on the API origin, matching the
      // parent flow.
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    return { ok: response.ok };
  } catch {
    // Never reached the server — the caller shows the same "check your details"
    // line either way, because there is nothing an admin can do differently.
    return { ok: false };
  }
}

/**
 * Revoke the session. Same reasoning as `adminSignIn` for bypassing `apiFetch`.
 *
 * Resolves rather than throws on failure: the caller navigates to the login screen
 * regardless, and a failed sign-out that left the admin looking at the CMS would be
 * worse than one that sent them to a page their stale cookie cannot open.
 */
export async function adminSignOut(): Promise<void> {
  try {
    await fetch(`${apiBaseUrl()}/api/auth/sign-out`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    // Intentionally swallowed — see above.
  }
}

// --- Curriculum CMS (file 32, FR-CURR-04, FR-CMS-01, FR-CMS-06) -----------

/**
 * `/api/admin/content/*`. Every payload type comes from `@kidlearn/types` — the
 * same schemas the route tests assert real bodies against — so the CMS cannot
 * drift from the server by redeclaring a shape (`backend.md §7`).
 *
 * There is **no `updateStatus`** here, deliberately, and no wrapper that takes a
 * status alongside other fields. Status moves through `transitionContent` and
 * nothing else, mirroring the server, where an edit body carrying `status` is a
 * `400`. A convenience wrapper that hid the distinction on the client is how a
 * caller ends up believing an edit can publish.
 */

const CONTENT_BASE = "/api/admin/content";

type ListOptions = { includeArchived?: boolean };

function listQuery(
  options: ListOptions & Record<string, string | number | boolean | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === false) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * `onColdStart` is offered on this one call only. The CMS fetches all four lists
 * together on mount, so one of them is enough to notice the API waking up
 * (NFR-PERF-04) — wiring it to all four would fire the same message four times.
 */
export function fetchWorlds(
  options: ListOptions & { onColdStart?: () => void } = {},
): Promise<ApiResult<AdminWorld[]>> {
  const { onColdStart, ...query } = options;
  return apiFetch<AdminWorld[]>(`${CONTENT_BASE}/worlds${listQuery(query)}`, {
    onColdStart,
  });
}

export function fetchSubjects(
  options: ListOptions = {},
): Promise<ApiResult<AdminSubject[]>> {
  return apiFetch<AdminSubject[]>(
    `${CONTENT_BASE}/subjects${listQuery(options)}`,
  );
}

export function fetchTopics(
  options: ListOptions & { subjectId?: string } = {},
): Promise<ApiResult<AdminTopic[]>> {
  return apiFetch<AdminTopic[]>(`${CONTENT_BASE}/topics${listQuery(options)}`);
}

export function fetchLessons(
  options: ListOptions & { topicId?: string } = {},
): Promise<ApiResult<AdminLesson[]>> {
  return apiFetch<AdminLesson[]>(
    `${CONTENT_BASE}/lessons${listQuery(options)}`,
  );
}

/** Everything a create or edit body may carry. The server validates it. */
export type ContentDraft = Record<string, unknown>;

export function createContent<TResult>(
  resource: ContentResourceName,
  body: ContentDraft,
): Promise<ApiResult<TResult>> {
  return apiFetch<TResult>(`${CONTENT_BASE}/${resource}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * `jobId` is the edit-then-approve breadcrumb (file 37, FR-AI-07): pass it when
 * the form was opened from the review queue and the server records
 * `edit_then_approve` on that job in the same request as the save. Omit it
 * everywhere else.
 */
export function updateContent<TResult>(
  resource: ContentResourceName,
  id: string,
  body: ContentDraft,
  jobId?: string,
): Promise<ApiResult<TResult>> {
  return apiFetch<TResult>(
    `${CONTENT_BASE}/${resource}/${id}${listQuery({ jobId })}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

/**
 * The single door to a status change, matching the server.
 *
 * `retries: 0`, unlike every other call here. `apiFetch` retries a 5xx because
 * the API sleeps on its free tier, but a transition is not idempotent in the way
 * a read is: the first attempt may have succeeded and only its response been
 * lost, and the replay would then be judged against the status the first one
 * wrote and fail with a confusing `409`. One attempt, and the admin retries
 * deliberately.
 */
export function transitionContent<TResult>(
  resource: ContentResourceName,
  id: string,
  to: ContentStatusValue,
): Promise<ApiResult<TResult>> {
  return apiFetch<TResult>(`${CONTENT_BASE}/${resource}/${id}/transition`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify({ to }),
  });
}

/**
 * Persists a whole sibling set's order. `orderedIds` must be exactly the
 * siblings the list is showing — the server rejects anything else rather than
 * applying it partially.
 *
 * `includeArchived` is therefore not optional decoration: it tells the server
 * which sibling set the payload is claiming to be, and has to match the flag the
 * list was fetched with. Omit it on a tree that hides archived rows and the
 * archived ids are neither expected nor sent; pass it on one that shows them and
 * they are ordered along with everything else.
 */
export function reorderContent(
  resource: OrderableContentResourceName,
  orderedIds: string[],
  parentId?: string,
  includeArchived?: boolean,
): Promise<ApiResult<ReorderedIds>> {
  return apiFetch<ReorderedIds>(`${CONTENT_BASE}/${resource}/reorder`, {
    method: "PATCH",
    retries: 0,
    body: JSON.stringify({
      orderedIds,
      ...(parentId ? { parentId } : {}),
      ...(includeArchived ? { includeArchived } : {}),
    }),
  });
}

// --- Media library (file 33, FR-CMS-02) -----------------------------------

/**
 * The three-step upload, as three functions.
 *
 * **No file byte goes through `apps/server`.** `signMediaUpload` asks our API for
 * a signature, `uploadToCloudinary` posts the file straight to Cloudinary, and
 * `registerMediaAsset` tells our API the delivery URL that came back. The server
 * has no disk and sleeps on its free tier, so proxying a lesson video through it
 * would be a request that times out against a memory ceiling nobody can raise.
 *
 * The visible cost is that an upload can half-fail. That trade is deliberate: a
 * file at Cloudinary with no row is an orphan, which costs storage and is
 * collectable; a row pointing at nothing is content a child cannot play.
 */

const MEDIA_BASE = "/api/admin/media";

export function fetchMediaAssets(
  filters: { kind?: AssetKind; language?: Locale } = {},
): Promise<ApiResult<MediaAsset[]>> {
  return apiFetch<MediaAsset[]>(`${MEDIA_BASE}${listQuery(filters)}`);
}

/**
 * `retries: 0`. A signature carries a timestamp Cloudinary expires, and replaying
 * the request would hand back a second credential for an upload that may already
 * be under way with the first.
 */
export function signMediaUpload(
  kind: AssetKind,
): Promise<ApiResult<UploadSignature>> {
  return apiFetch<UploadSignature>(`${MEDIA_BASE}/sign`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify({ kind }),
  });
}

export function registerMediaAsset(input: {
  url: string;
  kind: AssetKind;
  language: Locale | null;
}): Promise<ApiResult<MediaAsset>> {
  return apiFetch<MediaAsset>(MEDIA_BASE, {
    method: "POST",
    retries: 0,
    body: JSON.stringify(input),
  });
}

/**
 * Posts the file to Cloudinary and resolves with the delivery URL.
 *
 * **`XMLHttpRequest`, not `fetch`** — the one place in this app that is true.
 * `fetch` cannot report request-body progress, and a parent uploading a 40 MB
 * video needs a bar rather than a spinner that might mean anything.
 *
 * Deliberately **not** `apiFetch`: this request does not go to our API, carries no
 * session cookie, and answers with Cloudinary's own JSON rather than a `{ data }`
 * envelope. Sending credentials to a third-party host would be the bug, not a
 * convenience.
 *
 * Only the signed fields plus the file and `api_key` are sent. Cloudinary verifies
 * the signature over exactly the parameters it was computed from, so adding a
 * signed field here without adding it server-side is what produces
 * `Invalid Signature`.
 */
export function uploadToCloudinary(
  file: File,
  signature: UploadSignature,
  onProgress?: (percent: number) => void,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const form = new FormData();
  form.set("file", file);
  form.set("api_key", signature.apiKey);
  form.set("timestamp", String(signature.timestamp));
  form.set("folder", signature.folder);
  form.set("signature", signature.signature);

  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`,
    );

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    });

    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        resolve({
          ok: false,
          message: `Cloudinary refused the upload (${request.status}).`,
        });
        return;
      }
      // Verified external boundary: Cloudinary's documented upload response. The
      // URL is re-checked server-side against our own delivery host before any
      // row is written, so a malformed value here cannot become content.
      const body = JSON.parse(request.responseText) as { secure_url?: unknown };
      if (typeof body.secure_url !== "string") {
        resolve({ ok: false, message: "Cloudinary returned no secure URL." });
        return;
      }
      resolve({ ok: true, url: body.secure_url });
    });

    request.addEventListener("error", () =>
      resolve({ ok: false, message: "The upload could not reach Cloudinary." }),
    );
    request.addEventListener("abort", () =>
      resolve({ ok: false, message: "The upload was cancelled." }),
    );

    request.send(form);
  });
}

// --- Guided editors (file 33, FR-CMS-03, FR-GAM-04) -----------------------

/**
 * `/api/admin/content/{quizzes,activities,badges}`.
 *
 * `definition` and `rule` are sent as `unknown`, matching the server's boundary:
 * the shape is decided by the sibling `format` / `type` / `ruleType`, and the
 * editor has already validated it against the very same shared schema before
 * enabling Save. Declaring a narrower type here would mean a second, weaker copy
 * of that decision on the client.
 */

export function fetchQuiz(quizId: string): Promise<ApiResult<AdminQuizDetail>> {
  return apiFetch<AdminQuizDetail>(`${CONTENT_BASE}/quizzes/${quizId}`);
}

export function fetchQuizzes(
  options: ListOptions = {},
): Promise<ApiResult<AdminQuiz[]>> {
  return apiFetch<AdminQuiz[]>(`${CONTENT_BASE}/quizzes${listQuery(options)}`);
}

export function createQuiz(
  title: string | null,
): Promise<ApiResult<AdminQuiz>> {
  return apiFetch<AdminQuiz>(`${CONTENT_BASE}/quizzes`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

/** `jobId`: the edit-then-approve breadcrumb — see `updateContent`. */
export function createQuestion(
  quizId: string,
  body: { format: QuizQuestionType; definition: unknown },
  jobId?: string,
): Promise<ApiResult<AdminQuizQuestion>> {
  return apiFetch<AdminQuizQuestion>(
    `${CONTENT_BASE}/quizzes/${quizId}/questions${listQuery({ jobId })}`,
    { method: "POST", retries: 0, body: JSON.stringify(body) },
  );
}

export function replaceQuestion(
  quizId: string,
  questionId: string,
  body: { format: QuizQuestionType; definition: unknown },
  jobId?: string,
): Promise<ApiResult<AdminQuizQuestion>> {
  return apiFetch<AdminQuizQuestion>(
    `${CONTENT_BASE}/quizzes/${quizId}/questions/${questionId}${listQuery({ jobId })}`,
    { method: "PATCH", retries: 0, body: JSON.stringify(body) },
  );
}

/**
 * `retries: 0` and a body worth reading. A delete renumbers the survivors, so a
 * replay would be judged against a list that has already moved, and the response
 * is what the editor settles its order against rather than guessing.
 */
export function deleteQuestion(
  quizId: string,
  questionId: string,
  jobId?: string,
): Promise<ApiResult<QuestionDeleted>> {
  return apiFetch<QuestionDeleted>(
    `${CONTENT_BASE}/quizzes/${quizId}/questions/${questionId}${listQuery({ jobId })}`,
    { method: "DELETE", retries: 0 },
  );
}

export function fetchActivity(id: string): Promise<ApiResult<AdminActivity>> {
  return apiFetch<AdminActivity>(`${CONTENT_BASE}/activities/${id}`);
}

export function fetchActivities(
  options: ListOptions = {},
): Promise<ApiResult<AdminActivity[]>> {
  return apiFetch<AdminActivity[]>(
    `${CONTENT_BASE}/activities${listQuery(options)}`,
  );
}

export function createActivity(body: {
  type: string;
  definition: unknown;
}): Promise<ApiResult<AdminActivity>> {
  return apiFetch<AdminActivity>(`${CONTENT_BASE}/activities`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify(body),
  });
}

export function updateActivity(
  id: string,
  body: { type: string; definition: unknown },
): Promise<ApiResult<AdminActivity>> {
  return apiFetch<AdminActivity>(`${CONTENT_BASE}/activities/${id}`, {
    method: "PATCH",
    retries: 0,
    body: JSON.stringify(body),
  });
}

export function fetchBadges(
  options: ListOptions = {},
): Promise<ApiResult<AdminBadge[]>> {
  return apiFetch<AdminBadge[]>(`${CONTENT_BASE}/badges${listQuery(options)}`);
}

export function createBadge(
  body: ContentDraft,
): Promise<ApiResult<AdminBadge>> {
  return apiFetch<AdminBadge>(`${CONTENT_BASE}/badges`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify(body),
  });
}

export function updateBadge(
  id: string,
  body: ContentDraft,
): Promise<ApiResult<AdminBadge>> {
  return apiFetch<AdminBadge>(`${CONTENT_BASE}/badges/${id}`, {
    method: "PATCH",
    retries: 0,
    body: JSON.stringify(body),
  });
}

/**
 * The transition door for the editor resources, separate from
 * `transitionContent` only because the resource unions are separate — see
 * `EDITOR_CONTENT_RESOURCES` for why. `retries: 0` for the same reason.
 */
export function transitionEditorContent<TResult>(
  resource: EditorContentResourceName,
  id: string,
  to: ContentStatusValue,
): Promise<ApiResult<TResult>> {
  return apiFetch<TResult>(`${CONTENT_BASE}/${resource}/${id}/transition`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify({ to }),
  });
}

// --- AI generation (file 34, FR-AI-01) -------------------------------------

/**
 * Ask for a draft lesson. Answers with a job to look up, never with the lesson.
 *
 * `retries: 0`, and this is the call it matters most on. A generation is
 * expensive and not idempotent — replaying one that the API was slow to answer
 * would bill twice and leave two draft lessons in the same topic for a reviewer
 * to tell apart. It is also long: `apiFetch`'s cold-start retry exists for a
 * sleeping free-tier API, and a request that takes half a minute because a model
 * is writing is not a request that failed.
 */
export function generateLesson(
  body: GenerateLessonRequest,
): Promise<ApiResult<GenerationJobRef>> {
  return apiFetch<GenerationJobRef>("/api/admin/ai/generate/lesson", {
    method: "POST",
    retries: 0,
    body: JSON.stringify(body),
  });
}

export interface GenerateLessonRequest {
  gradeLevel: GradeLevelValue;
  subjectId: string;
  topicId: string;
  worldId?: string;
  lessonFocus: string;
  languages: Locale[];
}

/**
 * Ask for a draft story. Answers with a job to look up, never with the story.
 *
 * `retries: 0` for the reason `generateLesson` gives: a generation is expensive
 * and not idempotent, so replaying one the API was slow to answer would bill twice
 * and leave two draft stories for a reviewer to tell apart.
 */
export function generateStory(
  body: GenerateStoryRequest,
): Promise<ApiResult<GenerationJobRef>> {
  return apiFetch<GenerationJobRef>("/api/admin/ai/generate/story", {
    method: "POST",
    retries: 0,
    body: JSON.stringify(body),
  });
}

export interface GenerateStoryRequest {
  gradeLevels: GradeLevelValue[];
  theme: string;
  worldId: string;
  languages: Locale[];
  pageCount?: number;
}

/**
 * Ask for draft quiz questions on an existing lesson. `retries: 0`, as above.
 *
 * A `409` here is expected rather than exceptional: it means the lesson's quiz is
 * published, and the caller is meant to show the admin that they have to withdraw
 * it first. Branch on `error.details.code === "QUIZ_PUBLISHED"`.
 */
export function generateQuiz(
  body: GenerateQuizRequest,
): Promise<ApiResult<GenerationJobRef>> {
  return apiFetch<GenerationJobRef>("/api/admin/ai/generate/quiz", {
    method: "POST",
    retries: 0,
    body: JSON.stringify(body),
  });
}

export interface GenerateQuizRequest {
  lessonId: string;
  count?: number;
  languages: Locale[];
}

/**
 * Ask for the missing narration on a lesson, story or quiz (file 36, FR-AI-04).
 *
 * `retries: 0` for the reason the text generators give, doubled: one click here
 * is *n* provider calls, so a replay of a request the API was slow to answer
 * could bill an entire story twice. It is also the longest request in the CMS —
 * sixteen clips is sixteen sequential text-to-speech calls.
 *
 * A `429` here means today's audio budget is spent. `error.details` carries
 * `{ bucket, cap, used, pending }`, so a caller can say how much is left rather
 * than only that there is none.
 */
export function generateNarration(
  body: GenerateNarrationRequest,
): Promise<ApiResult<BatchGenerationRef>> {
  return apiFetch<BatchGenerationRef>("/api/admin/ai/generate/narration", {
    method: "POST",
    retries: 0,
    body: JSON.stringify(body),
  });
}

export interface GenerateNarrationRequest {
  entity: NarrationEntity;
  id: string;
}

/**
 * Ask for the missing illustrations on a story (file 36, FR-AI-05, FR-AI-09).
 *
 * `retries: 0`, as above. No prompt and no page list: the briefs are already on
 * the pages and the character sheets are applied server-side, which is what makes
 * the same rabbit appear on every page.
 */
export function generateIllustrations(
  storyId: string,
): Promise<ApiResult<BatchGenerationRef>> {
  return apiFetch<BatchGenerationRef>("/api/admin/ai/generate/illustrations", {
    method: "POST",
    retries: 0,
    body: JSON.stringify({ storyId }),
  });
}

// --- Character sheets (file 36, FR-AI-09) ---------------------------------

const CHARACTER_SHEET_BASE = `${CONTENT_BASE}/character-sheets`;

/**
 * `worldId` narrows to that world **plus the world-less sheets** — the set the
 * illustration generator applies to a story set there.
 */
export function fetchCharacterSheets(
  filters: { worldId?: string } = {},
): Promise<ApiResult<CharacterSheet[]>> {
  return apiFetch<CharacterSheet[]>(
    `${CHARACTER_SHEET_BASE}${listQuery(filters)}`,
  );
}

export function createCharacterSheet(body: {
  name: string;
  description: string;
  worldId: string | null;
}): Promise<ApiResult<CharacterSheet>> {
  return apiFetch<CharacterSheet>(CHARACTER_SHEET_BASE, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** `slug` is deliberately absent — see the endpoint's description for why. */
export function updateCharacterSheet(
  id: string,
  body: { name?: string; description?: string; worldId?: string | null },
): Promise<ApiResult<CharacterSheet>> {
  return apiFetch<CharacterSheet>(`${CHARACTER_SHEET_BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * Promote a story generation's cast into sheets.
 *
 * `retries: 0`: it creates rows, and a replay would be a second import of a cast
 * whose slugs the first import has just taken — harmless in outcome, since an
 * existing slug is skipped, but it would report `skipped` where the admin expects
 * `created` and read as a failure.
 */
export function promoteJobCharacters(
  jobId: string,
): Promise<ApiResult<PromotedCharacterSheets>> {
  return apiFetch<PromotedCharacterSheets>(`${CHARACTER_SHEET_BASE}/from-job`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify({ jobId }),
  });
}

// --- The AI review queue (file 37, FR-AI-07, FR-CMS-05..06) ---------------

/**
 * `/api/admin/ai/jobs/*` — the human gate.
 *
 * The two decision calls are `retries: 0`, and it matters more here than
 * anywhere else in this module. Approving publishes content to children and
 * rejecting takes it out of circulation; neither is idempotent, so replaying one
 * the API was slow to answer would be judged against the state the first attempt
 * wrote and come back as a `409` an admin cannot act on. One attempt, and the
 * admin retries deliberately.
 */

const AI_JOBS_BASE = "/api/admin/ai/jobs";

export interface AiJobFilters {
  status?: AiJobStatus;
  type?: AiJobType;
  language?: Locale;
  gradeLevel?: GradeLevelValue;
  take?: number;
  skip?: number;
}

export function fetchAiJobs(
  filters: AiJobFilters & { onColdStart?: () => void } = {},
): Promise<ApiResult<AiJobList>> {
  const { onColdStart, ...query } = filters;
  return apiFetch<AiJobList>(`${AI_JOBS_BASE}${listQuery(query)}`, {
    onColdStart,
  });
}

export function fetchAiJob(id: string): Promise<ApiResult<AiJobDetail>> {
  return apiFetch<AiJobDetail>(`${AI_JOBS_BASE}/${id}`);
}

/**
 * The sidebar badge's one number, polled from every CMS screen.
 *
 * Its own endpoint rather than a field on the list: sending a page of jobs to
 * render a count would refetch the queue on every tick from every open tab.
 */
export function fetchAiJobCount(): Promise<ApiResult<AiJobCount>> {
  return apiFetch<AiJobCount>(`${AI_JOBS_BASE}/count`);
}

/**
 * Approve, which publishes everything the job created (FR-CMS-06).
 *
 * A `409` here is expected rather than exceptional. `error.details.code` is
 * `APPROVAL_BLOCKED` with a `blockers` list — a linked row somebody has moved, or
 * a question still holding a placeholder asset — or `JOB_NOT_AWAITING_REVIEW`
 * when a colleague has already decided it. Both are worth showing verbatim.
 */
export function approveAiJob(id: string): Promise<ApiResult<AiReviewResult>> {
  return apiFetch<AiReviewResult>(`${AI_JOBS_BASE}/${id}/approve`, {
    method: "POST",
    retries: 0,
  });
}

/** Reject. The server requires at least ten characters of reason (FR-AI-08). */
export function rejectAiJob(
  id: string,
  reason: string,
): Promise<ApiResult<AiReviewResult>> {
  return apiFetch<AiReviewResult>(`${AI_JOBS_BASE}/${id}/reject`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify({ reason }),
  });
}
