import type {
  AiJobCount,
  AiJobDetail,
  AiJobList,
  AiJobStatus,
  AiJobType,
  AiReviewResult,
  BatchGenerationRef,
  CharacterSheet,
  GenerateLessonBody,
  GenerateNarrationBody,
  GenerateQuizBody,
  GenerateStoryBody,
  GenerationJobRef,
  GradeLevelValue,
  Locale,
  PromotedCharacterSheets,
} from "@kidlearn/types";
import { CONTENT_BASE, listQuery } from "@/features/admin/admin-url";
import { type ApiResult, apiFetch } from "@/shared/api/api-client";

// Generation endpoints answer with a job to look up, never the content; `retries: 0` because a replay would spend a second generation.
export function generateLesson(
  body: GenerateLessonBody,
): Promise<ApiResult<GenerationJobRef>> {
  return apiFetch<GenerationJobRef>("/api/admin/ai/generate/lesson", {
    method: "POST",
    retries: 0,
    body: JSON.stringify(body),
  });
}

export function generateStory(
  body: GenerateStoryBody,
): Promise<ApiResult<GenerationJobRef>> {
  return apiFetch<GenerationJobRef>("/api/admin/ai/generate/story", {
    method: "POST",
    retries: 0,
    body: JSON.stringify(body),
  });
}

export function generateQuiz(
  body: GenerateQuizBody,
): Promise<ApiResult<GenerationJobRef>> {
  return apiFetch<GenerationJobRef>("/api/admin/ai/generate/quiz", {
    method: "POST",
    retries: 0,
    body: JSON.stringify(body),
  });
}

export function generateNarration(
  body: GenerateNarrationBody,
): Promise<ApiResult<BatchGenerationRef>> {
  return apiFetch<BatchGenerationRef>("/api/admin/ai/generate/narration", {
    method: "POST",
    retries: 0,
    body: JSON.stringify(body),
  });
}

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

/** `worldId` narrows to that world plus the world-less sheets. */
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
