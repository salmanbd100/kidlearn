import type { ReorderedIds } from "@kidlearn/types";
import { type Request, Router } from "express";
import type { ZodType } from "zod";
import type { SuccessEnvelope } from "../../../shared/errors/errors.js";
import { adminContext } from "../../../shared/middleware/require-admin.js";
import {
  validate,
  validatedQuery,
} from "../../../shared/middleware/validate.js";
import { JobBreadcrumbQuerySchema } from "../admin-ai.schema.js";
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
} from "../admin-content.schema.js";
import { noteJobEdit } from "../job-breadcrumb.js";
import {
  type CharacterSheetDto,
  createCharacterSheet,
  listCharacterSheets,
  type PromotedCharacterSheets,
  promoteJobCharacters,
  updateCharacterSheet,
} from "./character-sheet.service.js";
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
} from "./content.service.js";

export const adminContentRouter = Router();

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

// Cast: routes using this are guarded by `validate({ params: AdminContentIdParamsSchema })`.
function idParam(req: Request): string {
  return req.params.id as string;
}

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

        // `201`: a `200` create is indistinguishable from an edit in client logs (`backend.md §5`).
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
      // `?jobId=…` on a save from the review queue records `edit_then_approve`. Registered for all four
      // resources so the next generated resource need not remember a per-resource validator.
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

// Character sheets sit outside `mountResource`, on this router rather than their own mount.
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
