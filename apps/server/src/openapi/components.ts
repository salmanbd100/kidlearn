import {
  ActiveChildResponseSchema,
  ActivityDefinitionSchema,
  ActivityEventResponseSchema,
  ActivityEventSchema,
  AdminActivityListResponseSchema,
  AdminActivityResponseSchema,
  AdminActivitySchema,
  AdminBadgeListResponseSchema,
  AdminBadgeResponseSchema,
  AdminBadgeSchema,
  AdminIdentityResponseSchema,
  AdminIdentitySchema,
  AdminLessonListResponseSchema,
  AdminLessonResponseSchema,
  AdminLessonSchema,
  AdminQuizDetailResponseSchema,
  AdminQuizDetailSchema,
  AdminQuizListResponseSchema,
  AdminQuizQuestionResponseSchema,
  AdminQuizQuestionSchema,
  AdminQuizResponseSchema,
  AdminQuizSchema,
  AdminSubjectListResponseSchema,
  AdminSubjectResponseSchema,
  AdminSubjectSchema,
  AdminTopicListResponseSchema,
  AdminTopicResponseSchema,
  AdminTopicSchema,
  AdminWorldListResponseSchema,
  AdminWorldResponseSchema,
  AdminWorldSchema,
  AiJobAssetSchema,
  AiJobCountResponseSchema,
  AiJobCountSchema,
  AiJobDetailResponseSchema,
  AiJobDetailSchema,
  AiJobEntitySchema,
  AiJobListResponseSchema,
  AiJobListSchema,
  AiJobSummarySchema,
  AiReviewResultResponseSchema,
  AiReviewResultSchema,
  AuthMeResponseSchema,
  AuthMeSchema,
  AvatarCharacterListResponseSchema,
  AvatarCharacterSchema,
  BatchGenerationRefResponseSchema,
  BatchGenerationRefSchema,
  CharacterSheetListResponseSchema,
  CharacterSheetResponseSchema,
  CharacterSheetSchema,
  CharacterUnlockListResponseSchema,
  CharacterUnlockSchema,
  ChildProfileListResponseSchema,
  ChildProfileResponseSchema,
  ChildProfileSchema,
  ChildStatsSchema,
  CompletionStreakSchema,
  ConsentRecordResponseSchema,
  DashboardActivityItemSchema,
  DashboardLearningMinutesSchema,
  DashboardSubjectProgressSchema,
  DashboardSummaryResponseSchema,
  DashboardSummarySchema,
  DeletedResponseSchema,
  DeletionRequestResponseSchema,
  ErrorEnvelopeSchema,
  GateStatusResponseSchema,
  GateStatusSchema,
  GenerationJobRefResponseSchema,
  GenerationJobRefSchema,
  HealthResponseSchema,
  HeartbeatResponseSchema,
  HeartbeatSchema,
  LearningTimeReadResponseSchema,
  LearningTimeSchema,
  LessonActivitySchema,
  LessonCompletionResponseSchema,
  LessonCompletionSchema,
  LessonDetailResponseSchema,
  LessonDetailSchema,
  LessonListItemSchema,
  LessonListResponseSchema,
  LessonProgressReadResponseSchema,
  LessonProgressResponseSchema,
  LessonProgressSchema,
  LessonQuizQuestionSchema,
  LessonQuizSchema,
  LocalizedLabelSchema,
  MediaAssetListResponseSchema,
  MediaAssetResponseSchema,
  MediaAssetSchema,
  MediaSummarySchema,
  NarrationTimingsSchema,
  NewBadgeSchema,
  NewCharacterSchema,
  ParentSummarySchema,
  PinGrantResponseSchema,
  PinStatusResponseSchema,
  PlatformOverviewResponseSchema,
  PlatformOverviewSchema,
  PromotedCharacterSheetsResponseSchema,
  PromotedCharacterSheetsSchema,
  QuestionDeletedResponseSchema,
  QuestionDeletedSchema,
  QuizQuestionSchema,
  QuizResponsesResponseSchema,
  QuizScoreSchema,
  ReorderedIdsResponseSchema,
  ReportNoteKeySchema,
  RewardSummaryResponseSchema,
  RewardSummarySchema,
  RewardTotalsSchema,
  ScreenTimeSettingResponseSchema,
  ScreenTimeSettingSchema,
  ScreenTimeStatusResponseSchema,
  ScreenTimeStatusSchema,
  ServiceIdentityResponseSchema,
  SessionEventRecordSchema,
  SessionEventResponseSchema,
  StoryCompletionResponseSchema,
  StoryCompletionSchema,
  StoryDetailResponseSchema,
  StoryDetailSchema,
  StoryListResponseSchema,
  StoryPageSchema,
  StorySummarySchema,
  SubjectListResponseSchema,
  SubjectSummarySchema,
  TopicListResponseSchema,
  TopicSummarySchema,
  UploadSignatureResponseSchema,
  UploadSignatureSchema,
  ValidationDetailsSchema,
  WeeklyReportBadgeSchema,
  WeeklyReportJobResponseSchema,
  WeeklyReportJobResultSchema,
  WeeklyReportListResponseSchema,
  WeeklyReportListSchema,
  WeeklyReportMetricsSchema,
  WeeklyReportSchema,
  WorldLessonsResponseSchema,
  WorldListResponseSchema,
  WorldSummarySchema,
  WorldTopicLessonsSchema,
} from "@kidlearn/types";
import type { ZodTypeAny } from "zod";
import {
  AiJobListQuerySchema,
  GenerateIllustrationsSchema,
  GenerateLessonSchema,
  GenerateNarrationSchema,
  GenerateQuizSchema,
  GenerateStorySchema,
  JobBreadcrumbQuerySchema,
  RejectJobSchema,
} from "../schemas/admin-ai.js";
import {
  CharacterSheetCreateSchema,
  CharacterSheetUpdateSchema,
  LessonCreateSchema,
  LessonUpdateSchema,
  PromoteJobCharactersSchema,
  ReorderSchema,
  SubjectCreateSchema,
  SubjectUpdateSchema,
  TopicCreateSchema,
  TopicUpdateSchema,
  TransitionSchema,
  WorldCreateSchema,
  WorldUpdateSchema,
} from "../schemas/admin-content.js";
import {
  ActivityUpsertSchema,
  BadgeCreateSchema,
  BadgeUpdateSchema,
  QuestionUpsertSchema,
  QuizCreateSchema,
  QuizUpdateSchema,
} from "../schemas/admin-editors.js";
import {
  RegisterAssetSchema,
  SignUploadSchema,
} from "../schemas/admin-media.js";
import {
  CreateChildBodySchema,
  UpdateChildBodySchema,
} from "../schemas/children.js";
import { ActivityEventBodySchema } from "../schemas/events.js";
import {
  ConsentSchema,
  DeleteAccountSchema,
  SetPinSchema,
  VerifyPinSchema,
} from "../schemas/parent.js";
import {
  LessonStepBodySchema,
  QuizResponsesBodySchema,
  SessionEventBodySchema,
} from "../schemas/progress.js";
import { ScreenTimeBodySchema } from "../schemas/screen-time.js";
import {
  buildComponentSchemas,
  type JsonSchemaObject,
  schemaRef,
} from "./to-json-schema.js";

/**
 * Everything under `components` in the document: the named schema registry, the
 * session-cookie security scheme, and the error responses that repeat across
 * operations.
 */

/**
 * Named schemas, request and response alike.
 *
 * Exported so `document.test.ts` can parse every hand-written `example` in the
 * document against the schema its `$ref` names — the conversion to JSON Schema
 * drops refinements, so the Zod object is the stricter check of the two.
 */
export const SCHEMA_DEFINITIONS: Record<string, ZodTypeAny> = {
  ErrorEnvelope: ErrorEnvelopeSchema,
  ValidationDetails: ValidationDetailsSchema,

  CreateChildBody: CreateChildBodySchema,
  UpdateChildBody: UpdateChildBodySchema,
  SetPinBody: SetPinSchema,
  VerifyPinBody: VerifyPinSchema,
  ConsentBody: ConsentSchema,
  DeleteAccountBody: DeleteAccountSchema,
  LessonStepBody: LessonStepBodySchema,
  ActivityEventBody: ActivityEventBodySchema,
  SessionEventBody: SessionEventBodySchema,
  QuizResponsesBody: QuizResponsesBodySchema,
  ScreenTimeBody: ScreenTimeBodySchema,

  ServiceIdentityResponse: ServiceIdentityResponseSchema,
  HealthResponse: HealthResponseSchema,

  ParentSummary: ParentSummarySchema,
  AuthMe: AuthMeSchema,
  AuthMeResponse: AuthMeResponseSchema,
  PinStatusResponse: PinStatusResponseSchema,
  PinGrantResponse: PinGrantResponseSchema,
  GateStatus: GateStatusSchema,
  GateStatusResponse: GateStatusResponseSchema,
  ConsentRecordResponse: ConsentRecordResponseSchema,
  DeletionRequestResponse: DeletionRequestResponseSchema,
  DeletedResponse: DeletedResponseSchema,

  ChildStats: ChildStatsSchema,
  ChildProfile: ChildProfileSchema,
  ChildProfileResponse: ChildProfileResponseSchema,
  ChildProfileListResponse: ChildProfileListResponseSchema,
  ActiveChildResponse: ActiveChildResponseSchema,

  AvatarCharacter: AvatarCharacterSchema,
  AvatarCharacterListResponse: AvatarCharacterListResponseSchema,
  CharacterUnlock: CharacterUnlockSchema,
  CharacterUnlockListResponse: CharacterUnlockListResponseSchema,

  MediaSummary: MediaSummarySchema,
  WorldSummary: WorldSummarySchema,
  SubjectSummary: SubjectSummarySchema,
  TopicSummary: TopicSummarySchema,
  LessonListItem: LessonListItemSchema,
  WorldTopicLessons: WorldTopicLessonsSchema,
  LessonActivity: LessonActivitySchema,
  LessonQuizQuestion: LessonQuizQuestionSchema,
  LessonQuiz: LessonQuizSchema,
  LessonDetail: LessonDetailSchema,
  WorldListResponse: WorldListResponseSchema,
  WorldLessonsResponse: WorldLessonsResponseSchema,
  SubjectListResponse: SubjectListResponseSchema,
  TopicListResponse: TopicListResponseSchema,
  LessonListResponse: LessonListResponseSchema,
  LessonDetailResponse: LessonDetailResponseSchema,

  StorySummary: StorySummarySchema,
  NarrationTimings: NarrationTimingsSchema,
  StoryPage: StoryPageSchema,
  StoryDetail: StoryDetailSchema,
  StoryListResponse: StoryListResponseSchema,
  StoryDetailResponse: StoryDetailResponseSchema,

  LessonProgress: LessonProgressSchema,
  LessonProgressReadResponse: LessonProgressReadResponseSchema,
  LessonProgressResponse: LessonProgressResponseSchema,
  SessionEventRecord: SessionEventRecordSchema,
  SessionEventResponse: SessionEventResponseSchema,
  QuizScore: QuizScoreSchema,
  QuizResponsesResponse: QuizResponsesResponseSchema,

  // --- Learning time ------------------------------------------------------
  // No request shape for the heartbeat: it has no body, which is the contract
  // (FR-TIME-06).
  Heartbeat: HeartbeatSchema,
  HeartbeatResponse: HeartbeatResponseSchema,
  ActivityEvent: ActivityEventSchema,
  ActivityEventResponse: ActivityEventResponseSchema,
  LearningTime: LearningTimeSchema,
  LearningTimeReadResponse: LearningTimeReadResponseSchema,

  // --- Dashboard ----------------------------------------------------------
  // Response shapes only: the endpoint takes a child id and nothing else, so
  // there is no request body to register.
  LocalizedLabel: LocalizedLabelSchema,
  DashboardLearningMinutes: DashboardLearningMinutesSchema,
  DashboardSubjectProgress: DashboardSubjectProgressSchema,
  DashboardActivityItem: DashboardActivityItemSchema,
  DashboardSummary: DashboardSummarySchema,
  DashboardSummaryResponse: DashboardSummaryResponseSchema,

  // --- Weekly reports -----------------------------------------------------
  // Response shapes only. Neither endpoint takes a body: the report list is a
  // read, and the job derives its week from the server clock rather than from a
  // parameter a mis-configured scheduler could get wrong.
  ReportNoteKey: ReportNoteKeySchema,
  WeeklyReportBadge: WeeklyReportBadgeSchema,
  WeeklyReportMetrics: WeeklyReportMetricsSchema,
  WeeklyReport: WeeklyReportSchema,
  WeeklyReportList: WeeklyReportListSchema,
  WeeklyReportListResponse: WeeklyReportListResponseSchema,
  WeeklyReportJobResult: WeeklyReportJobResultSchema,
  WeeklyReportJobResponse: WeeklyReportJobResponseSchema,

  // --- Admin CMS ----------------------------------------------------------
  // Response shapes only. Neither endpoint takes a body or a parameter: the
  // identity call reads the session, and the counters derive both of their
  // windows from the server clock (FR-CMS-01, FR-CMS-07).
  AdminIdentity: AdminIdentitySchema,
  AdminIdentityResponse: AdminIdentityResponseSchema,
  PlatformOverview: PlatformOverviewSchema,
  PlatformOverviewResponse: PlatformOverviewResponseSchema,

  // --- Admin CMS: the curriculum hierarchy (file 32) -----------------------
  // Both halves of every contract. The request schemas are the objects
  // `validate()` runs at the boundary, so a `.strict()` body that rejects
  // `status` is rejecting it in the published document too — which is the point
  // (FR-CMS-06).
  AdminWorldCreateBody: WorldCreateSchema,
  AdminWorldUpdateBody: WorldUpdateSchema,
  AdminSubjectCreateBody: SubjectCreateSchema,
  AdminSubjectUpdateBody: SubjectUpdateSchema,
  AdminTopicCreateBody: TopicCreateSchema,
  AdminTopicUpdateBody: TopicUpdateSchema,
  AdminLessonCreateBody: LessonCreateSchema,
  AdminLessonUpdateBody: LessonUpdateSchema,
  ContentTransitionBody: TransitionSchema,
  ContentReorderBody: ReorderSchema,
  AdminWorld: AdminWorldSchema,
  AdminWorldResponse: AdminWorldResponseSchema,
  AdminWorldListResponse: AdminWorldListResponseSchema,
  AdminSubject: AdminSubjectSchema,
  AdminSubjectResponse: AdminSubjectResponseSchema,
  AdminSubjectListResponse: AdminSubjectListResponseSchema,
  AdminTopic: AdminTopicSchema,
  AdminTopicResponse: AdminTopicResponseSchema,
  AdminTopicListResponse: AdminTopicListResponseSchema,
  AdminLesson: AdminLessonSchema,
  AdminLessonResponse: AdminLessonResponseSchema,
  AdminLessonListResponse: AdminLessonListResponseSchema,
  ReorderedIdsResponse: ReorderedIdsResponseSchema,

  // --- Admin CMS: character sheets (file 36, FR-AI-09) ---------------------
  // Prompt input, not content — which is why no schema here carries a `status`.
  // Nothing student-facing reads the table, so there is nothing for the
  // publishing workflow to protect. See `paths/admin-content.ts`.
  AdminCharacterSheetCreateBody: CharacterSheetCreateSchema,
  AdminCharacterSheetUpdateBody: CharacterSheetUpdateSchema,
  AdminPromoteJobCharactersBody: PromoteJobCharactersSchema,
  CharacterSheet: CharacterSheetSchema,
  CharacterSheetResponse: CharacterSheetResponseSchema,
  CharacterSheetListResponse: CharacterSheetListResponseSchema,
  PromotedCharacterSheets: PromotedCharacterSheetsSchema,
  PromotedCharacterSheetsResponse: PromotedCharacterSheetsResponseSchema,

  // --- Admin CMS: the media library (file 33, FR-CMS-02) -------------------
  // The request halves are the objects `validate()` runs, so the `.strict()`
  // bodies documented here are the ones that reject an unknown key. The
  // Cloudinary-host rule on `url` is a Zod `.refine()` and is therefore invisible
  // in the schema — it is written out in the operation's description instead.
  MediaSignUploadBody: SignUploadSchema,
  MediaRegisterAssetBody: RegisterAssetSchema,
  MediaAsset: MediaAssetSchema,
  MediaAssetResponse: MediaAssetResponseSchema,
  MediaAssetListResponse: MediaAssetListResponseSchema,
  UploadSignature: UploadSignatureSchema,
  UploadSignatureResponse: UploadSignatureResponseSchema,

  // --- Admin CMS: the guided editors (file 33, FR-CMS-03, FR-GAM-04) -------
  // `definition` and `rule` are untyped in the request bodies on purpose — the
  // server parses each against the one member of the shared union its sibling
  // enum names, which is what turns a wrong payload into an issue naming the
  // field rather than one saying "Invalid input". The response schemas carry the
  // real unions, so a route test's `assertContract` proves the round trip.
  AdminQuizCreateBody: QuizCreateSchema,
  AdminQuizUpdateBody: QuizUpdateSchema,
  AdminQuizQuestionBody: QuestionUpsertSchema,
  AdminActivityBody: ActivityUpsertSchema,
  AdminBadgeCreateBody: BadgeCreateSchema,
  AdminBadgeUpdateBody: BadgeUpdateSchema,
  AdminQuiz: AdminQuizSchema,
  AdminQuizResponse: AdminQuizResponseSchema,
  AdminQuizListResponse: AdminQuizListResponseSchema,
  AdminQuizDetail: AdminQuizDetailSchema,
  AdminQuizDetailResponse: AdminQuizDetailResponseSchema,
  AdminQuizQuestion: AdminQuizQuestionSchema,
  AdminQuizQuestionResponse: AdminQuizQuestionResponseSchema,
  QuestionDeleted: QuestionDeletedSchema,
  QuestionDeletedResponse: QuestionDeletedResponseSchema,
  AdminActivity: AdminActivitySchema,
  AdminActivityResponse: AdminActivityResponseSchema,
  AdminActivityListResponse: AdminActivityListResponseSchema,
  AdminBadge: AdminBadgeSchema,
  AdminBadgeResponse: AdminBadgeResponseSchema,
  AdminBadgeListResponse: AdminBadgeListResponseSchema,

  // --- Admin AI: the generation pipeline (file 34, FR-AI-01, FR-AI-08) -----
  // Request and response both. The response is deliberately two fields — see the
  // operation description for why a generation answers with a job rather than
  // with the lesson it wrote.
  AiGenerateLessonBody: GenerateLessonSchema,
  // File 35 — the story and quiz generators answer with the same job reference.
  // One response schema for all three, because a caller's next step is identical
  // whichever it asked for: look the job up in the review queue.
  AiGenerateStoryBody: GenerateStorySchema,
  AiGenerateQuizBody: GenerateQuizSchema,
  GenerationJobRef: GenerationJobRefSchema,
  GenerationJobRefResponse: GenerationJobRefResponseSchema,
  // File 36 — the two media generators. A different response schema, because one
  // click there creates *n* jobs and reports how many pairs it skipped; see the
  // operation descriptions for why `skipped` is half the answer.
  AiGenerateNarrationBody: GenerateNarrationSchema,
  AiGenerateIllustrationsBody: GenerateIllustrationsSchema,
  BatchGenerationRef: BatchGenerationRefSchema,
  BatchGenerationRefResponse: BatchGenerationRefResponseSchema,

  // --- Admin AI: the review queue (file 37, FR-AI-07, FR-CMS-05..06) -------
  // The human gate. `AiJobDetail.input` and `.rawOutput` are `unknown` on
  // purpose — they are the FR-AI-08 audit record, whose shape differs per
  // generator and changes whenever a prompt does; the review screen renders them
  // in a JSON inspector rather than as typed fields. `AiJobListQuery` and
  // `JobBreadcrumbQuery` are registered as request shapes so the list filters and
  // the edit-then-approve breadcrumb are readable from the spec alone.
  AiJobListQuery: AiJobListQuerySchema,
  AiJobRejectBody: RejectJobSchema,
  JobBreadcrumbQuery: JobBreadcrumbQuerySchema,
  AiJobSummary: AiJobSummarySchema,
  AiJobEntity: AiJobEntitySchema,
  AiJobAsset: AiJobAssetSchema,
  AiJobDetail: AiJobDetailSchema,
  AiJobDetailResponse: AiJobDetailResponseSchema,
  AiJobList: AiJobListSchema,
  AiJobListResponse: AiJobListResponseSchema,
  AiJobCount: AiJobCountSchema,
  AiJobCountResponse: AiJobCountResponseSchema,
  AiReviewResult: AiReviewResultSchema,
  AiReviewResultResponse: AiReviewResultResponseSchema,

  ScreenTimeSetting: ScreenTimeSettingSchema,
  ScreenTimeSettingResponse: ScreenTimeSettingResponseSchema,
  ScreenTimeStatus: ScreenTimeStatusSchema,
  ScreenTimeStatusResponse: ScreenTimeStatusResponseSchema,

  // --- Rewards ------------------------------------------------------------
  // Response shapes only, and there is no request shape to register: no
  // endpoint accepts a reward amount or type (FR-GAM-08).
  RewardTotals: RewardTotalsSchema,
  NewBadge: NewBadgeSchema,
  NewCharacter: NewCharacterSchema,
  CompletionStreak: CompletionStreakSchema,
  LessonCompletion: LessonCompletionSchema,
  LessonCompletionResponse: LessonCompletionResponseSchema,
  RewardSummary: RewardSummarySchema,
  RewardSummaryResponse: RewardSummaryResponseSchema,
  StoryCompletion: StoryCompletionSchema,
  StoryCompletionResponse: StoryCompletionResponseSchema,

  // --- Versioned content payloads -----------------------------------------
  // Registered so the activity and quiz JSONB contracts are readable from the
  // spec alone. This is what files 18–22 build their engines against, and it is
  // the same union the server validates a published row with before serving it.
  ActivityDefinition: ActivityDefinitionSchema,
  QuizQuestion: QuizQuestionSchema,
};

export const COMPONENT_SCHEMAS = buildComponentSchemas(SCHEMA_DEFINITIONS);

/**
 * better-auth issues an httpOnly session cookie; there is no bearer token
 * anywhere in this API. `apiKey`/`cookie` is how OpenAPI 3.0 spells that.
 */
export const SECURITY_SCHEMES = {
  sessionCookie: {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description:
      "better-auth session cookie, set by the Google OAuth callback and sent automatically by the browser. Because this page is served from the same origin as the API, signing in at `/api/auth/google` is enough to make **Send** work on every authenticated operation below — leave the value box empty, there is no token to paste. Named `__Secure-better-auth.session_token` in production.\n\nThe generated code samples show this as a `Set-Cookie` request header, which is the one thing they get wrong: script cannot set that header, and nothing needs to — the browser attaches the cookie itself on a same-origin request.",
  },
  /** The shared secret on `/api/admin/jobs/*` (file 30). */
  cronSecret: {
    type: "http",
    scheme: "bearer",
    description:
      "`Authorization: Bearer <CRON_SECRET>`. A static shared secret from the server's environment, not a token anyone signs in for. **Try it out** in this page will not work for these operations unless you paste the secret yourself.",
  },
} as const;

/** Applied to every operation; public ones override it with `security: []`. */
export const DEFAULT_SECURITY = [{ sessionCookie: [] }];

export const TAGS = [
  {
    name: "Health",
    description:
      "Liveness endpoints. Database-free by design (NFR-PERF-04) so they answer while the database is asleep.",
  },
  {
    name: "Auth",
    description:
      "Google OAuth sign-in and session identity. Parents only — kidlearn has no password login and no sign-up step: the Google callback creates the identity and the first authenticated request creates the domain row.",
  },
  {
    name: "Parent Account",
    description:
      "The parent's own account: the parental PIN gate, COPPA consent, and account deletion.",
  },
  {
    name: "Children",
    description:
      "Learner profiles, at most five per household. Scoped entirely by the session — there is no parent id parameter anywhere on these routes.",
  },
  {
    name: "Characters",
    description:
      "Avatar characters. `GET /api/characters` lists the published starter set a brand-new profile picks from; the per-child lists additionally carry the characters that must be *earned*, flagged with whether that child has unlocked them yet (FR-GAM-05). Unlock rules are `Character.unlockRule` JSONB read against the child's ledger totals — nothing about an unlock is decided or reported by a client.",
  },
  {
    name: "Screen Time",
    description:
      "Parental limits on *starting* new content (FR-TIME-01..05): a daily allowance and an access window, both per child and both owned by the parent. The policy is written behind the PIN gate on `/api/children/{id}/screen-time`; the student surface reads its own verdict from `/api/screen-time/status` without one, because a five-year-old must never meet a PIN pad on their own home screen.\n\n**Enforcement is server-side and happens at the start of content, not during it.** `GET /api/content/lessons/{id}` and `GET /api/content/stories/{id}` answer `423 Locked` when the gate is shut; step, completion and event endpoints never do, so a lesson already under way can always be finished (FR-TIME-03) and its time keeps being recorded (FR-TIME-06). A lesson with an incomplete `LessonProgress` row written in the past 30 minutes is exempt from its own gate — resuming is not starting — while replaying a finished one is a new start and is gated, as is picking up one abandoned longer ago than that.\n\nThe minutes a limit is compared against are the same server-derived figure the parent dashboard shows, from one shared function, so a limit and a dashboard can never disagree about how long a child has been learning.",
  },
  {
    name: "Dashboard",
    description:
      "What the parent dashboard renders for one child (FR-DASH-01..04): learning minutes for three windows, per-subject completion, and the recent-activity feed — all in one request, because the screen reads them together and four PIN-gated calls would be four chances for a lapsed grant to leave half a dashboard on screen.\n\nEvery figure is the server's. Minutes come from the same `getLearningMinutes` a screen-time limit is checked against, so a dashboard and a limit can never disagree; completion comes from `LessonProgress`; the feed from `LessonProgress` and `RewardLedger`. Nothing a client sends contributes to any of them (FR-TIME-06, spec §7).\n\n**Titles arrive in both locales**, unlike every other localised response in this API. The reader is the parent, their dashboard language is an i18next choice the server never sees, and there is no parent language column — so resolving to the *child's* language here would show an English-reading parent Bangla lesson titles inside English chrome.",
  },
  {
    name: "Reports",
    description:
      "The weekly progress report (FR-DASH-05..06): one persisted row per child per week, holding active days, learning minutes, the letters, words and numbers met for the first time, lessons and stories finished, first-attempt quiz accuracy, badges earned, and an encouraging note.\n\n**A stored snapshot, not a live query.** The figures are computed once the week has ended and read back verbatim, so content unpublished in October cannot quietly rewrite August. Regeneration for a week *replaces* its row — the unique index on `(childId, weekStart)` is what makes the history structurally incapable of holding a duplicate week, however many times either trigger fires.\n\n**Two triggers, because the free tier has no worker.** The list endpoint fills in the last completed week for the child being viewed; `POST /api/admin/jobs/weekly-reports` does it for everybody on an external schedule. Both are the same idempotent upsert.\n\n**The note is a key, not a sentence** — the client renders it through i18next, which is what makes it readable in Bangla. It is chosen by a deterministic ordered rule list, not generated; the stored `key + params` shape is what would let an LLM be swapped in behind it later without a migration.",
  },
  {
    name: "Content",
    description:
      "The student-facing curriculum. Every response is filtered to `status = published` and the active child's grade, with text resolved to their language — all of it server-side, from the child record, never from request input.",
  },
  {
    name: "Stories",
    description:
      "The Story Library — reachable from the main menu at any time and never nested inside a lesson (FR-STORY-01). Filtered and localised exactly like the curriculum: `status = published`, the child's grade, their language with an English fallback, all decided server-side. A story's `world` travels as the full world row, so a cover themes itself from the same `palette` a world tile does (FR-STORY-04). Replays are unlimited and free (FR-STORY-06) — `completed` marks a cover, it never locks one.",
  },
  {
    name: "Progress",
    description:
      "What a child has done: their position in a lesson, and the append-only event log learning time is derived from. The client reports events; the server decides what they mean and when they happened (spec §7, FR-TIME-06). Every write is scoped to the session's active child and to lessons that child can actually see.",
  },
  {
    name: "Learning Time",
    description:
      "Where time comes from, and what it adds up to (FR-TIME-06, FR-DASH-02). The student surfaces post a heartbeat every 30 seconds while their tab is visible plus a milestone event now and then; nothing they send carries a timestamp, a duration or a total. The server stamps every row, drops a beat arriving under 20 seconds after the last, and derives minutes from the density of what it stored — so a refresh, a closed tab, cleared storage or an edited client state cannot lower a recorded minute. Aggregation is one service function shared by the heartbeat's own `minutesToday`, the parent dashboard and the weekly report, so a screen-time limit and a dashboard can never disagree about how long a child has been learning.",
  },
  {
    name: "Rewards",
    description:
      "Stars, coins, badges and streaks. Balances are `SUM(amount)` aggregates over the append-only `RewardLedger`, never stored counters, and every grant is written by one server-side service from constants it holds itself. **No endpoint anywhere in this API accepts a reward amount or a reward type** — rewards are earned, and there is no purchase path (FR-GAM-08). Replaying a lesson grants nothing: a unique index on `(childId, rewardType, sourceType, sourceId)` makes that structural rather than a check somebody could forget.\n\nBadges are data, not code: a `Badge` row carries a `ruleType` and a `rule` JSONB blob that a server-side engine interprets, so a new milestone is an admin writing a row (FR-GAM-04). Streaks are consecutive **local** days — a calendar day in the deployment's `APP_TIMEZONE`, never a device clock — with at least one completion in them (FR-GAM-06).",
  },
  {
    name: "Admin",
    description:
      "The administrator surface (spec §4.3, FR-CMS-01). A **separate principal** from a parent, not a parent with extra rights: an admin has no children, no PIN and no consent record, and nothing on these paths takes a parent or child id.\n\nAdmins and parents share one better-auth instance and one `user` table — one session store, one cookie, one CORS configuration — so what separates them is a domain row rather than infrastructure: an `AdminUser` exists for an admin's identity and never for a Google sign-in, and `Parent` provisioning requires a Google account. Each side's guard therefore rejects the other's session with a `403`, in both directions.\n\nThere is **no self-service signup**. `POST /api/auth/sign-up/email` is disabled for everybody, so the only way an admin exists is `pnpm --filter server seed:admin`, and re-running that seed is how a forgotten password is recovered — there is no self-service reset flow. A signed-in admin can change their own password through better-auth's `POST /api/auth/change-password`, undocumented here because `apps/web` does not call it. Rate limiting on the login route lands with file 38.\n\nAnalytics here is platform-wide aggregate only (FR-CMS-07, basic tier) — no response names a household, and detailed analytics are Phase 2.",
  },
  {
    name: "Admin CMS: Curriculum",
    description:
      "The curriculum hierarchy — worlds, subjects, topics, lessons — and the workflow that decides what a child can see (file 32, FR-CURR-04, FR-CMS-01, FR-CMS-06).\n\n**The mirror image of the `Content` tag.** Those endpoints return `status = published` rows with text resolved to one child's language; these return every row in every status, with both locales, and the ids an editor needs. The safety property is not that this API is careful — it is that the *student* API filters, so the only thing that makes content visible here is writing `published` to the column.\n\n**`status` changes on one path only.** Create and edit bodies are `.strict()` with no `status` key, so `POST /{id}/transition` is the sole door, and behind it is a matrix in which `published` is reachable from `approved` and nowhere else. Rejected work cannot be published by undoing the rejection; it goes back through `draft → in_review → approved`. An illegal hop is a `409` carrying `INVALID_TRANSITION` and the legal alternatives.\n\n**Publishing takes effect at once** — no staging flag, no cache, no queue — and so does unpublishing, which returns a row to `draft` while keeping it and the progress recorded against it.\n\nOrdering is a separate operation for the same reason status is: `PATCH /{resource}/reorder` writes a whole sibling set at once, because one row's position is a claim about its siblings'. Every write here stamps `updatedBy` with the acting administrator.",
  },
  {
    name: "Admin CMS: Editors",
    description:
      "The guided editors behind quizzes, their questions, activities and badges (file 33, FR-CMS-03, FR-GAM-04). Same publishing workflow as the curriculum, applied to the rows a lesson points at.\n\n**`definition` and `rule` are versioned JSONB, and the request bodies type them as untyped values on purpose.** The server parses each against the one member of the shared union its sibling enum names, so a wrong payload comes back as `definition.prompt.bn: Required` rather than the `Invalid input` a failed union produces. The full unions are the **ActivityDefinition** and **QuizQuestion** schemas, and the response bodies carry them.\n\n**A `published` row refuses an edit** with `409 EDIT_REQUIRES_UNPUBLISH`. The transition matrix guards the act of publishing, not what stays published afterwards — without this a `PATCH` could rewrite a live quiz question and reach a child without passing a reviewer again. Withdraw to `draft`, edit, then come back through the matrix.",
  },
  {
    name: "Admin CMS: Media",
    description:
      "The media library: images, audio and video, held as Cloudinary delivery URLs (file 33, FR-CMS-02).\n\n**No file byte passes through this API.** The browser asks `POST /api/admin/media/sign` for a signature, `POST`s the file straight to Cloudinary, then registers the URL it got back with `POST /api/admin/media`. Not an optimisation — this service runs on a free tier that sleeps and has no disk, so proxying a lesson video through it would be a request that times out on a cold start.\n\nThe visible consequence is that an upload is two requests and can half-fail. That trade is deliberate: a file uploaded but never registered is an orphan that costs storage and is collectable; the reverse — a row pointing at nothing — is content a child cannot play.",
  },
  {
    name: "Admin CMS: Characters",
    description:
      'Character sheets: the **stable visual description** of one recurring character, whose only consumer is the illustration prompt (FR-AI-09).\n\nThey exist because an image model is stateless — it draws whatever one prompt says and remembers nothing about the picture it drew a second ago, so "the rabbit" on page 3 and "the rabbit" on page 7 come back as two different rabbits. `POST /api/admin/ai/generate/illustrations` prepends every applicable sheet\'s `description` verbatim to every page\'s prompt, and that is the whole mechanism.\n\n**These rows are not content and carry no `status`.** Nothing under `/api/content/*` reads this table, so there is nothing for the publishing workflow to protect — which is why they sit outside the transition machinery, ordering, translations and the `updatedBy` stamp the four curriculum resources share.\n\nNot to be confused with the `Characters` tag, which is the avatars a *child* wears.',
  },
  {
    name: "Admin AI",
    description:
      "AI content generation (files 34–37, FR-AI-01..08). An administrator describes what they want; a Gemini call writes it; the result lands in the review queue as **draft** rows and a job row, and stops there.\n\n**No endpoint on this surface can publish, and it is the schema rather than the code that guarantees it.** Every generated row takes the `draft` default on its `status` column, and status moves on one path only — `POST /api/admin/content/{resource}/{id}/transition`, behind which `published` is reachable from `approved` and nowhere else. A child therefore cannot see generated content until a person has read it (FR-AI-07).\n\n**Every generation is auditable.** The `AIGenerationJob` row keeps the exact system and user prompts the model saw, both verbatim attempts — a schema failure buys exactly one retry, with the validation errors fed back — and the tokens all of it cost, successful or not (FR-AI-08).\n\n**The model is never asked for prose.** It answers against a response schema generated from the same Zod objects the renderer draws from and the admin editors validate against, so there is no free text to parse and no second description of a payload shape to drift (FR-AI-03).\n\nGeneration is awaited inside the request: this deployment has no worker and no queue, so a background job would be a promise it could not keep. The reply is a job reference in any case, which is what makes a queue a later change nobody has to notice.",
  },
  {
    name: "Jobs",
    description:
      "Work an external scheduler triggers, authenticated by a shared secret rather than a session — the caller is cron-job.org, which has nobody to sign in as (see the `cronSecret` scheme). Every job here only ever **recomputes** something the server already owns, and none of them read per-child data out: with a static credential sitting in a third party's configuration field, there is no human for a response to be scoped to.",
  },
];

/**
 * `x-tagGroups` — the sidebar's top level. Twenty tags and 109 operations is more
 * than a flat list reads well as, and the five groups here are the five audiences:
 * nobody integrating against the student surface needs the CMS in their way.
 *
 * **Every tag must appear in exactly one group.** A reader that honours this
 * extension builds its navigation from the groups alone and silently drops a tag
 * that no group names — the operations stay in the document and vanish from the
 * page. `document.test.ts` asserts the two lists agree, in both directions.
 */
export const TAG_GROUPS = [
  { name: "Getting started", tags: ["Health", "Auth"] },
  {
    name: "Parent & household",
    tags: [
      "Parent Account",
      "Children",
      "Characters",
      "Screen Time",
      "Dashboard",
      "Reports",
    ],
  },
  {
    name: "Student experience",
    tags: ["Content", "Stories", "Progress", "Learning Time", "Rewards"],
  },
  {
    name: "Administration",
    tags: [
      "Admin",
      "Admin CMS: Curriculum",
      "Admin CMS: Editors",
      "Admin CMS: Media",
      "Admin CMS: Characters",
      "Admin AI",
    ],
  },
  { name: "Automation", tags: ["Jobs"] },
];

/**
 * A `4xx`/`5xx` response referencing the shared error envelope.
 *
 * `details` is optional and worth supplying where the failure carries a payload
 * a client acts on. `ErrorEnvelope.details` is `z.unknown()` — deliberately, so
 * nothing depends on it — which renders as an empty schema, so the example is
 * the only place a reader can see the shape at all.
 */
export function errorResponse(
  description: string,
  codes: readonly string[],
  details?: unknown,
): JsonSchemaObject {
  const codeList = codes.map((code) => `\`${code}\``).join(", ");
  return {
    description: `${description}\n\nPossible \`error.code\` values: ${codeList}.`,
    content: {
      "application/json": {
        schema: schemaRef("ErrorEnvelope"),
        // Without an explicit example, a reader generates one from the schema
        // and picks the *first* value of the `code` enum — so every error on
        // every operation would display `VALIDATION_FAILED`, including 401s and
        // 500s that can never return it. The description says the right thing
        // while the sample body contradicts it, and readers trust the sample.
        example: {
          error: {
            code: codes[0],
            message:
              "A developer-facing hint. Never branch on it — branch on `code`.",
            ...(details === undefined ? {} : { details }),
          },
        },
      },
    },
  };
}

/**
 * A `2xx` response referencing a registered response schema.
 *
 * `example` is optional and worth supplying on the reads a client is actually
 * built against. Without one a reader generates a sample from the schema, which
 * fills every string with `"string"` and every enum with its first member — fine
 * for a two-field body, useless for a lesson with nested activities, quiz
 * questions and both locales' text. Deliberately not supplied everywhere: an
 * example nobody reads is an example that drifts.
 */
export function jsonResponse(
  description: string,
  schemaName: string,
  example?: unknown,
): JsonSchemaObject {
  return {
    description,
    content: {
      "application/json": {
        schema: schemaRef(schemaName),
        ...(example === undefined ? {} : { example }),
      },
    },
  };
}

/** A request body referencing a registered request schema. Always required. */
export function jsonRequestBody(
  schemaName: string,
  description?: string,
): JsonSchemaObject {
  return {
    required: true,
    ...(description ? { description } : {}),
    content: { "application/json": { schema: schemaRef(schemaName) } },
  };
}

/** The `401` every guarded operation shares. */
export const UNAUTHORIZED_RESPONSE = errorResponse(
  "No valid session cookie. Sign in at `GET /api/auth/google` first.",
  ["UNAUTHORIZED"],
);

/** The `400` every operation with a validated body or param shares. */
export const VALIDATION_RESPONSE = errorResponse(
  "The request body or path parameter failed Zod validation at the route boundary; nothing reached the database. `error.details` carries `ZodError.flatten()` output — see the `ValidationDetails` schema.",
  ["VALIDATION_FAILED"],
  // The shape a form binds to, and the only place it is visible: `details` is
  // `unknown` in the envelope schema, so a reader renders it as `{}`. Keys of
  // `fieldErrors` are the failing field names and every value is an array —
  // one field can fail several rules at once. `formErrors` holds the errors
  // that belong to the body as a whole rather than to any one field.
  {
    formErrors: [],
    fieldErrors: {
      firstName: ["String must contain at least 1 character(s)"],
      age: ["Expected number, received string", "Number must be less than 7"],
    },
  },
);

/** The `500` fallback. Every unexpected error is reported as this and no more. */
export const INTERNAL_RESPONSE = errorResponse(
  "Unexpected server error. The underlying error is logged with the request id; the response never carries any part of it.",
  ["INTERNAL"],
);
