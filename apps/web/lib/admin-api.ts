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
import { type ApiResult, apiBaseUrl, apiFetch, signOut } from "./api-client";

/**
 * Typed wrappers over `/api/admin/*` and the two better-auth calls the CMS makes.
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

/** Sign in with email and password — the only password login in the product. */
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

/** Revoke the session. One endpoint serves both principals (file 29). */
export const adminSignOut = signOut;

/**
 * `/api/admin/content/*`. Every payload type comes from `@kidlearn/types` — the
 * same schemas the route tests assert real bodies against — so the CMS cannot
 * drift from the server by redeclaring a shape (`backend.md §7`).
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

/** The single door to a status change, matching the server. */
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

// The three-step upload, as three functions.

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

/** Posts the file to Cloudinary and resolves with the delivery URL. */
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

// `/api/admin/content/{quizzes,activities,badges}`.

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

/**
 * Ask for a draft lesson. Answers with a job to look up, never with the lesson.
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

/** Promote a story generation's cast into sheets. */
export function promoteJobCharacters(
  jobId: string,
): Promise<ApiResult<PromotedCharacterSheets>> {
  return apiFetch<PromotedCharacterSheets>(`${CHARACTER_SHEET_BASE}/from-job`, {
    method: "POST",
    retries: 0,
    body: JSON.stringify({ jobId }),
  });
}

// `/api/admin/ai/jobs/*` — the human gate.

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

/** The sidebar badge's one number, polled from every CMS screen. */
export function fetchAiJobCount(): Promise<ApiResult<AiJobCount>> {
  return apiFetch<AiJobCount>(`${AI_JOBS_BASE}/count`);
}

/** Approve, which publishes everything the job created (FR-CMS-06). */
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
