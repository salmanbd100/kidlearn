import type { ReorderedIds } from "@kidlearn/types";
import { type Request, Router } from "express";
import type { ZodType } from "zod";
import type { SuccessEnvelope } from "../../lib/errors.js";
import { adminContext } from "../../middleware/require-admin.js";
import { validate, validatedQuery } from "../../middleware/validate.js";
import { JobBreadcrumbQuerySchema } from "../../schemas/admin-ai.js";
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
import { noteJobEdit } from "./job-breadcrumb.js";

/**
 * `/api/admin/content/*` — CRUD over the curriculum hierarchy (file 32,
 * FR-CURR-04, FR-CMS-01, FR-CMS-06).
 */
export const adminContentRouter = Router();

/** `PATCH /:resource/reorder` is registered before `PATCH /:resource/:id`. */
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
 */
function idParam(req: Request): string {
  return req.params.id as string;
}

/** Registers the four operations every resource shares. */
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
    validate({
      params: AdminContentIdParamsSchema,
      body: schemas.update,
      // File 37 — `?jobId=…` on a save made from the review queue records
      // `edit_then_approve` on that job. Registered for all four resources rather
      // than lessons alone: only `Lesson` carries `aiJobId` today, but a
      // per-resource validator would be a rule the next generated resource has to
      // remember, and an absent `jobId` costs nothing.
      query: JobBreadcrumbQuerySchema,
    }),
    async (req, res, next) => {
      try {
        const admin = adminContext(req);
        const updated = await handlers.update(idParam(req), req.body, admin.id);
        await noteJobEdit(req, res);

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

/**
 * Character sheets live on this router rather than getting their own mount, and
 * outside `mountResource`.
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

/** Promotes a story generation's cast into sheets. */
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
