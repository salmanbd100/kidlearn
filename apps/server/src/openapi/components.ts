import {
  ActiveChildResponseSchema,
  ActivityDefinitionSchema,
  AuthMeResponseSchema,
  AuthMeSchema,
  AvatarCharacterListResponseSchema,
  AvatarCharacterSchema,
  ChildProfileListResponseSchema,
  ChildProfileResponseSchema,
  ChildProfileSchema,
  ChildStatsSchema,
  ConsentRecordResponseSchema,
  DeletedResponseSchema,
  DeletionRequestResponseSchema,
  ErrorEnvelopeSchema,
  GateStatusResponseSchema,
  GateStatusSchema,
  HealthResponseSchema,
  LessonActivitySchema,
  LessonDetailResponseSchema,
  LessonDetailSchema,
  LessonListItemSchema,
  LessonListResponseSchema,
  LessonQuizQuestionSchema,
  LessonQuizSchema,
  MediaSummarySchema,
  ParentSummarySchema,
  PinGrantResponseSchema,
  PinStatusResponseSchema,
  QuizQuestionSchema,
  ServiceIdentityResponseSchema,
  SubjectListResponseSchema,
  SubjectSummarySchema,
  TopicListResponseSchema,
  TopicSummarySchema,
  ValidationDetailsSchema,
  WorldLessonsResponseSchema,
  WorldListResponseSchema,
  WorldSummarySchema,
  WorldTopicLessonsSchema,
} from "@kidlearn/types";
import type { ZodTypeAny } from "zod";
import {
  CreateChildBodySchema,
  UpdateChildBodySchema,
} from "../schemas/children.js";
import {
  ConsentSchema,
  DeleteAccountSchema,
  SetPinSchema,
  VerifyPinSchema,
} from "../schemas/parent.js";
import {
  buildComponentSchemas,
  type JsonSchemaObject,
  schemaRef,
} from "./to-json-schema.js";

/**
 * Everything under `components` in the document: the named schema registry, the
 * session-cookie security scheme, and the error responses that repeat across
 * operations.
 *
 * Every schema listed here is the *same object* the server validates with or the
 * tests assert against. Nothing in this file restates a shape — that is the whole
 * point, and it is why the page cannot drift from the server.
 */

/**
 * Named schemas, request and response alike.
 *
 * Both a payload (`ChildProfile`) and the envelope that wraps it
 * (`ChildProfileResponse`) are registered, so a reader can look up either.
 *
 * Size note: because `to-json-schema.ts` must inline rather than cross-reference
 * (see the `$refStrategy` comment there for why), a schema nested inside another
 * is emitted in both places — `ActivityDefinition` appears standalone and again
 * inside `LessonDetail`. That puts the served document at roughly 165 KB (~600 KB
 * when pretty-printed by `openapi:write`), which gzips to about 20 KB. Accepted
 * deliberately: it is a development-only page, and the alternative is
 * hand-composing response bodies in JSON, which reintroduces exactly the second
 * source of truth this file exists to eliminate.
 */
const SCHEMA_DEFINITIONS: Record<string, ZodTypeAny> = {
  // --- Envelopes and errors ------------------------------------------------
  ErrorEnvelope: ErrorEnvelopeSchema,
  ValidationDetails: ValidationDetailsSchema,

  // --- Requests (the very schemas `validate()` runs at the boundary) -------
  CreateChildBody: CreateChildBodySchema,
  UpdateChildBody: UpdateChildBodySchema,
  SetPinBody: SetPinSchema,
  VerifyPinBody: VerifyPinSchema,
  ConsentBody: ConsentSchema,
  DeleteAccountBody: DeleteAccountSchema,

  // --- Health -------------------------------------------------------------
  ServiceIdentityResponse: ServiceIdentityResponseSchema,
  HealthResponse: HealthResponseSchema,

  // --- Auth / parent account ----------------------------------------------
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

  // --- Children -----------------------------------------------------------
  ChildStats: ChildStatsSchema,
  ChildProfile: ChildProfileSchema,
  ChildProfileResponse: ChildProfileResponseSchema,
  ChildProfileListResponse: ChildProfileListResponseSchema,
  ActiveChildResponse: ActiveChildResponseSchema,

  // --- Characters ---------------------------------------------------------
  AvatarCharacter: AvatarCharacterSchema,
  AvatarCharacterListResponse: AvatarCharacterListResponseSchema,

  // --- Content ------------------------------------------------------------
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
 *
 * The name gains a `__Secure-` prefix in production, where better-auth sets
 * `secure: true`.
 */
export const SECURITY_SCHEMES = {
  sessionCookie: {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description:
      "better-auth session cookie, set by the Google OAuth callback and sent automatically by the browser. Because Swagger UI is served from this same origin, signing in at `/api/auth/google` is enough to make **Try it out** work on every authenticated operation below — there is no token to paste. Named `__Secure-better-auth.session_token` in production.",
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
      "Avatar characters. At MVP only the published starter set is readable, which is what the child-profile form picks from; earned characters and their unlock rules arrive in file 24.",
  },
  {
    name: "Content",
    description:
      "The student-facing curriculum. Every response is filtered to `status = published` and the active child's grade, with text resolved to their language — all of it server-side, from the child record, never from request input.",
  },
];

/**
 * A `4xx`/`5xx` response referencing the shared error envelope.
 *
 * `codes` is not decoration: a 403 on this API can mean `FORBIDDEN`,
 * `CONSENT_REQUIRED`, `PIN_REQUIRED`, `PIN_VERIFICATION_REQUIRED` or
 * `PIN_INVALID`, and which ones an operation can return is exactly what a client
 * developer needs in order to branch correctly.
 */
export function errorResponse(
  description: string,
  codes: readonly string[],
): JsonSchemaObject {
  const codeList = codes.map((code) => `\`${code}\``).join(", ");
  return {
    description: `${description}\n\nPossible \`error.code\` values: ${codeList}.`,
    content: {
      "application/json": {
        schema: schemaRef("ErrorEnvelope"),
        // Without an explicit example, Swagger UI generates one from the schema
        // and picks the *first* value of the `code` enum — so every error on
        // every operation would display `VALIDATION_FAILED`, including 401s and
        // 500s that can never return it. The description says the right thing
        // while the sample body contradicts it, and readers trust the sample.
        example: {
          error: {
            code: codes[0],
            message:
              "A developer-facing hint. Never branch on it — branch on `code`.",
          },
        },
      },
    },
  };
}

/** A `2xx` response referencing a registered response schema. */
export function jsonResponse(
  description: string,
  schemaName: string,
): JsonSchemaObject {
  return {
    description,
    content: { "application/json": { schema: schemaRef(schemaName) } },
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
);

/** The `500` fallback. Every unexpected error is reported as this and no more. */
export const INTERNAL_RESPONSE = errorResponse(
  "Unexpected server error. The underlying error is logged with the request id; the response never carries any part of it.",
  ["INTERNAL"],
);
