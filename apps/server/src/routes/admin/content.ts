import type { ReorderedIds } from "@kidlearn/types";
import { type Request, Router } from "express";
import type { ZodType } from "zod";
import type { SuccessEnvelope } from "../../lib/errors.js";
import { adminContext } from "../../middleware/require-admin.js";
import { validate, validatedQuery } from "../../middleware/validate.js";
import {
  AdminContentIdParamsSchema,
  type AdminContentListQuery,
  AdminContentListQuerySchema,
  type AdminLessonListQuery,
  AdminLessonListQuerySchema,
  type AdminTopicListQuery,
  AdminTopicListQuerySchema,
  CharacterSheetCreateSchema,
  type CharacterSheetListQuery,
  CharacterSheetListQuerySchema,
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
} from "../../schemas/admin-content.js";
import {
  type AdminContentDto,
  type ContentResource,
  createLesson,
  createSubject,
  createTopic,
  createWorld,
  getLesson,
  getSubject,
  getTopic,
  getWorld,
  listLessons,
  listSubjects,
  listTopics,
  listWorlds,
  type OrderableResource,
  reorderContent,
  transitionContent,
  updateLesson,
  updateSubject,
  updateTopic,
  updateWorld,
} from "../../services/adminContentService.js";
import {
  type CharacterSheetDto,
  createCharacterSheet,
  listCharacterSheets,
  type PromotedCharacterSheets,
  promoteJobCharacters,
  updateCharacterSheet,
} from "../../services/characterSheetService.js";

/**
 * `/api/admin/content/*` — CRUD over the curriculum hierarchy (file 32,
 * FR-CURR-04, FR-CMS-01, FR-CMS-06).
 *
 * Mounted inside `adminRouter`, which applies `requireAdmin` to everything under
 * it, so every path here is guarded by construction — a parent's perfectly valid
 * session gets a `403` and an anonymous one a `401`, without this file naming
 * either.
 *
 * ## Publishing makes content visible to children immediately
 *
 * There is no staging step and no second flag. `POST /:resource/:id/transition
 * { "to": "published" }` writes `status = published`, and the very next student
 * request returns the row, because every query in `routes/content.ts` filters
 * `status = published` and nothing else gates it (FR-CMS-06). `published →
 * draft` withdraws it just as immediately, keeping the row and the progress
 * attached to it.
 *
 * That is also why **`PATCH` cannot change `status`**. The update schemas are
 * `.strict()` with no `status` key, so a body carrying one is a `400` — the
 * transition endpoint is the only door, and the matrix in
 * `services/contentStatusService.ts` stands behind it. An edit route that
 * accepted `status` would be a way to publish unreviewed content in front of a
 * five-year-old with a single request.
 *
 * ## Shape of this file
 *
 * The four resources differ only in their schemas and service functions, so they
 * are registered by one `mount` helper rather than four hand-written blocks. Four
 * copies of the same five handlers is four chances for one of them to forget the
 * audit stamp or the `.strict()` body — and the copy that forgets is the one that
 * ships. The OpenAPI registrations are generated from the same table for the same
 * reason (`openapi/paths/admin-content.ts`).
 */
export const adminContentRouter = Router();

/**
 * `PATCH /:resource/reorder` is registered before `PATCH /:resource/:id`.
 *
 * Express matches in registration order and `reorder` is a valid path segment, so
 * the reverse order would send every reorder into the update handler — where the
 * uuid params schema would reject it with a confusing `400` about `id`.
 */
function mountReorder(resource: OrderableResource): void {
  adminContentRouter.patch(
    `/${resource}/reorder`,
    validate({ body: ReorderSchema }),
    async (req, res, next) => {
      try {
        const admin = adminContext(req);
        const orderedIds = await reorderContent(resource, req.body, admin.id);

        const payload: SuccessEnvelope<ReorderedIds> = { data: { orderedIds } };
        res.json(payload);
      } catch (error) {
        next(error);
      }
    },
  );
}

for (const resource of ["subjects", "topics", "lessons"] as const) {
  mountReorder(resource);
}

/**
 * Reads the `:id` path parameter, on routes guarded by
 * `validate({ params: AdminContentIdParamsSchema })`.
 *
 * Express 5 types every param as `string | string[]`, because a repeated segment
 * can produce an array. The cast is safe only *after* that middleware has run: it
 * replaced `req.params` with the Zod-parsed object, in which `id` is a uuid
 * string — or the request never reached the handler (`400 VALIDATION_FAILED`).
 * Same reasoning as `idParam` in `routes/content.ts`.
 */
function idParam(req: Request): string {
  return req.params.id as string;
}

/**
 * Registers the four operations every resource shares.
 *
 * Generic over the two body types so the pairing is *checked*: the create schema
 * a caller passes has to be the one its create function accepts. A non-generic
 * signature would need `never` or `unknown` for the body and would happily wire
 * the lesson schema to the subject service.
 *
 * `list` is not here — each resource's query schema differs, since a topic list
 * filters by subject and a world list by nothing.
 */
function mountResource<TCreate, TUpdate>(
  resource: ContentResource,
  schemas: { create: ZodType<TCreate>; update: ZodType<TUpdate> },
  handlers: {
    create: (body: TCreate, adminId: string) => Promise<AdminContentDto>;
    read: (id: string) => Promise<AdminContentDto>;
    update: (
      id: string,
      body: TUpdate,
      adminId: string,
    ) => Promise<AdminContentDto>;
  },
): void {
  adminContentRouter.post(
    `/${resource}`,
    validate({ body: schemas.create }),
    async (req, res, next) => {
      try {
        const admin = adminContext(req);
        const created = await handlers.create(req.body, admin.id);

        // `201`: a create that answered `200` would be indistinguishable from an
        // edit in a client's logs (`backend.md §5`).
        const payload: SuccessEnvelope<AdminContentDto> = { data: created };
        res.status(201).json(payload);
      } catch (error) {
        next(error);
      }
    },
  );

  adminContentRouter.get(
    `/${resource}/:id`,
    validate({ params: AdminContentIdParamsSchema }),
    async (req, res, next) => {
      try {
        const payload: SuccessEnvelope<AdminContentDto> = {
          data: await handlers.read(idParam(req)),
        };
        res.json(payload);
      } catch (error) {
        next(error);
      }
    },
  );

  adminContentRouter.patch(
    `/${resource}/:id`,
    validate({ params: AdminContentIdParamsSchema, body: schemas.update }),
    async (req, res, next) => {
      try {
        const admin = adminContext(req);
        const updated = await handlers.update(idParam(req), req.body, admin.id);

        const payload: SuccessEnvelope<AdminContentDto> = { data: updated };
        res.json(payload);
      } catch (error) {
        next(error);
      }
    },
  );

  adminContentRouter.post(
    `/${resource}/:id/transition`,
    validate({ params: AdminContentIdParamsSchema, body: TransitionSchema }),
    async (req, res, next) => {
      try {
        const admin = adminContext(req);
        const moved = await transitionContent(
          resource,
          idParam(req),
          req.body.to,
          admin.id,
        );

        const payload: SuccessEnvelope<AdminContentDto> = { data: moved };
        res.json(payload);
      } catch (error) {
        next(error);
      }
    },
  );
}

// --- Lists ----------------------------------------------------------------

adminContentRouter.get(
  "/worlds",
  validate({ query: AdminContentListQuerySchema }),
  async (_req, res, next) => {
    try {
      const { includeArchived } = validatedQuery<AdminContentListQuery>(res);

      const payload: SuccessEnvelope<AdminContentDto[]> = {
        data: await listWorlds({ includeArchived }),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentRouter.get(
  "/subjects",
  validate({ query: AdminContentListQuerySchema }),
  async (_req, res, next) => {
    try {
      const { includeArchived } = validatedQuery<AdminContentListQuery>(res);

      const payload: SuccessEnvelope<AdminContentDto[]> = {
        data: await listSubjects({ includeArchived }),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentRouter.get(
  "/topics",
  validate({ query: AdminTopicListQuerySchema }),
  async (_req, res, next) => {
    try {
      const query = validatedQuery<AdminTopicListQuery>(res);

      const payload: SuccessEnvelope<AdminContentDto[]> = {
        data: await listTopics(query),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentRouter.get(
  "/lessons",
  validate({ query: AdminLessonListQuerySchema }),
  async (_req, res, next) => {
    try {
      const query = validatedQuery<AdminLessonListQuery>(res);

      const payload: SuccessEnvelope<AdminContentDto[]> = {
        data: await listLessons(query),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

// --- Per-resource CRUD ----------------------------------------------------

mountResource(
  "worlds",
  { create: WorldCreateSchema, update: WorldUpdateSchema },
  { create: createWorld, read: getWorld, update: updateWorld },
);

mountResource(
  "subjects",
  { create: SubjectCreateSchema, update: SubjectUpdateSchema },
  { create: createSubject, read: getSubject, update: updateSubject },
);

mountResource(
  "topics",
  { create: TopicCreateSchema, update: TopicUpdateSchema },
  { create: createTopic, read: getTopic, update: updateTopic },
);

mountResource(
  "lessons",
  { create: LessonCreateSchema, update: LessonUpdateSchema },
  { create: createLesson, read: getLesson, update: updateLesson },
);

// --- Character sheets (file 36, FR-AI-09) ---------------------------------

/**
 * Character sheets live on this router rather than getting their own mount, and
 * outside `mountResource`.
 *
 * They opt out of all four rules that helper encodes: no publishing workflow (a
 * sheet is never student-facing, so it has no `status`), no ordering, no
 * translations, and no `updatedBy` audit stamp. Running them through it would mean
 * teaching it about a resource that wants none of it.
 *
 * `/from-job` is registered before `/:id` for the reason `reorder` is above it:
 * Express matches in registration order and a literal segment would otherwise be
 * read as an id — though here the methods differ, so the ordering is insurance
 * rather than a fix.
 */
adminContentRouter.get(
  "/character-sheets",
  validate({ query: CharacterSheetListQuerySchema }),
  async (_req, res, next) => {
    try {
      const query = validatedQuery<CharacterSheetListQuery>(res);

      const payload: SuccessEnvelope<CharacterSheetDto[]> = {
        data: await listCharacterSheets(query),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentRouter.post(
  "/character-sheets",
  validate({ body: CharacterSheetCreateSchema }),
  async (req, res, next) => {
    try {
      const created = await createCharacterSheet(req.body);

      const payload: SuccessEnvelope<CharacterSheetDto> = { data: created };
      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Promotes a story generation's cast into sheets.
 *
 * `201` even when every character was skipped: the request was well formed and the
 * outcome is in the body, and a `200`/`201` split on "did anything get created"
 * would make an idempotent re-import look like a different kind of event.
 */
adminContentRouter.post(
  "/character-sheets/from-job",
  validate({ body: PromoteJobCharactersSchema }),
  async (req, res, next) => {
    try {
      const result = await promoteJobCharacters(req.body.jobId);

      const payload: SuccessEnvelope<PromotedCharacterSheets> = {
        data: result,
      };
      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentRouter.patch(
  "/character-sheets/:id",
  validate({
    params: AdminContentIdParamsSchema,
    body: CharacterSheetUpdateSchema,
  }),
  async (req, res, next) => {
    try {
      const updated = await updateCharacterSheet(idParam(req), req.body);

      const payload: SuccessEnvelope<CharacterSheetDto> = { data: updated };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);
