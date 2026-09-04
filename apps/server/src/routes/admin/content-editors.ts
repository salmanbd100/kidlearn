import type { QuestionDeleted } from "@kidlearn/types";
import { type Request, Router } from "express";
import type { SuccessEnvelope } from "../../lib/errors.js";
import { validate, validatedQuery } from "../../middleware/validate.js";
import { JobBreadcrumbQuerySchema } from "../../schemas/admin-ai.js";
import { TransitionSchema } from "../../schemas/admin-content.js";
import {
  type ActivityListQuery,
  ActivityListQuerySchema,
  ActivityUpsertSchema,
  BadgeCreateSchema,
  BadgeUpdateSchema,
  EditorIdParamsSchema,
  type EditorListQuery,
  EditorListQuerySchema,
  QuestionParamsSchema,
  QuestionUpsertSchema,
  QuizCreateSchema,
  QuizIdParamsSchema,
  QuizUpdateSchema,
} from "../../schemas/admin-editors.js";
import {
  type AdminActivityDto,
  type AdminBadgeDto,
  type AdminEditorDto,
  type AdminQuizDetailDto,
  type AdminQuizDto,
  type AdminQuizQuestionDto,
  createActivity,
  createBadge,
  createQuestion,
  createQuiz,
  deleteQuestion,
  getActivity,
  getBadge,
  getQuiz,
  listActivities,
  listBadges,
  listQuizzes,
  replaceQuestion,
  transitionEditorContent,
  updateActivity,
  updateBadge,
  updateQuiz,
} from "../../services/adminEditorService.js";
import { noteJobEdit } from "./job-breadcrumb.js";

/**
 * `/api/admin/content/{quizzes,activities,badges}` — the guided editors
 * (file 33, FR-CMS-03, FR-GAM-04).
 */
export const adminContentEditorsRouter = Router();

/**
 * Reads a uuid path parameter on a route guarded by the matching params schema.
 */
function param(req: Request, name: "id" | "quizId"): string {
  return req.params[name] as string;
}

adminContentEditorsRouter.post(
  "/quizzes",
  validate({ body: QuizCreateSchema }),
  async (req, res, next) => {
    try {
      const payload: SuccessEnvelope<AdminQuizDto> = {
        data: await createQuiz(req.body),
      };
      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.get(
  "/quizzes",
  validate({ query: EditorListQuerySchema }),
  async (_req, res, next) => {
    try {
      const { includeArchived } = validatedQuery<EditorListQuery>(res);

      const payload: SuccessEnvelope<AdminQuizDto[]> = {
        data: await listQuizzes({ includeArchived }),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.get(
  "/quizzes/:quizId",
  validate({ params: QuizIdParamsSchema }),
  async (req, res, next) => {
    try {
      const payload: SuccessEnvelope<AdminQuizDetailDto> = {
        data: await getQuiz(param(req, "quizId")),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.patch(
  "/quizzes/:quizId",
  validate({
    params: QuizIdParamsSchema,
    body: QuizUpdateSchema,
    query: JobBreadcrumbQuerySchema,
  }),
  async (req, res, next) => {
    try {
      const payload: SuccessEnvelope<AdminQuizDto> = {
        data: await updateQuiz(param(req, "quizId"), req.body),
      };
      await noteJobEdit(req, res);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.post(
  "/quizzes/:quizId/questions",
  validate({
    params: QuizIdParamsSchema,
    body: QuestionUpsertSchema,
    query: JobBreadcrumbQuerySchema,
  }),
  async (req, res, next) => {
    try {
      const created = await createQuestion(param(req, "quizId"), req.body);
      await noteJobEdit(req, res);

      const payload: SuccessEnvelope<AdminQuizQuestionDto> = { data: created };
      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.patch(
  "/quizzes/:quizId/questions/:id",
  validate({
    params: QuestionParamsSchema,
    body: QuestionUpsertSchema,
    query: JobBreadcrumbQuerySchema,
  }),
  async (req, res, next) => {
    try {
      const updated = await replaceQuestion(
        param(req, "quizId"),
        param(req, "id"),
        req.body,
      );
      await noteJobEdit(req, res);

      const payload: SuccessEnvelope<AdminQuizQuestionDto> = { data: updated };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.delete(
  "/quizzes/:quizId/questions/:id",
  validate({ params: QuestionParamsSchema, query: JobBreadcrumbQuerySchema }),
  async (req, res, next) => {
    try {
      const removed = await deleteQuestion(
        param(req, "quizId"),
        param(req, "id"),
      );
      await noteJobEdit(req, res);

      const payload: SuccessEnvelope<QuestionDeleted> = { data: removed };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.post(
  "/activities",
  validate({ body: ActivityUpsertSchema }),
  async (req, res, next) => {
    try {
      const payload: SuccessEnvelope<AdminActivityDto> = {
        data: await createActivity(req.body),
      };
      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.get(
  "/activities",
  validate({ query: ActivityListQuerySchema }),
  async (_req, res, next) => {
    try {
      const query = validatedQuery<ActivityListQuery>(res);

      const payload: SuccessEnvelope<AdminActivityDto[]> = {
        data: await listActivities(query),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.get(
  "/activities/:id",
  validate({ params: EditorIdParamsSchema }),
  async (req, res, next) => {
    try {
      const payload: SuccessEnvelope<AdminActivityDto> = {
        data: await getActivity(param(req, "id")),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.patch(
  "/activities/:id",
  validate({
    params: EditorIdParamsSchema,
    body: ActivityUpsertSchema,
    query: JobBreadcrumbQuerySchema,
  }),
  async (req, res, next) => {
    try {
      const payload: SuccessEnvelope<AdminActivityDto> = {
        data: await updateActivity(param(req, "id"), req.body),
      };
      await noteJobEdit(req, res);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.post(
  "/badges",
  validate({ body: BadgeCreateSchema }),
  async (req, res, next) => {
    try {
      const payload: SuccessEnvelope<AdminBadgeDto> = {
        data: await createBadge(req.body),
      };
      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.get(
  "/badges",
  validate({ query: EditorListQuerySchema }),
  async (_req, res, next) => {
    try {
      const { includeArchived } = validatedQuery<EditorListQuery>(res);

      const payload: SuccessEnvelope<AdminBadgeDto[]> = {
        data: await listBadges({ includeArchived }),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.get(
  "/badges/:id",
  validate({ params: EditorIdParamsSchema }),
  async (req, res, next) => {
    try {
      const payload: SuccessEnvelope<AdminBadgeDto> = {
        data: await getBadge(param(req, "id")),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminContentEditorsRouter.patch(
  "/badges/:id",
  validate({ params: EditorIdParamsSchema, body: BadgeUpdateSchema }),
  async (req, res, next) => {
    try {
      const payload: SuccessEnvelope<AdminBadgeDto> = {
        data: await updateBadge(param(req, "id"), req.body),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

/** The three resources share one transition handler, registered per segment. */
for (const [resource, idName] of [
  ["quizzes", "quizId"],
  ["activities", "id"],
  ["badges", "id"],
] as const) {
  adminContentEditorsRouter.post(
    `/${resource}/:${idName}/transition`,
    validate({
      params: idName === "quizId" ? QuizIdParamsSchema : EditorIdParamsSchema,
      body: TransitionSchema,
    }),
    async (req, res, next) => {
      try {
        const moved = await transitionEditorContent(
          resource,
          param(req, idName),
          req.body.to,
        );

        const payload: SuccessEnvelope<AdminEditorDto> = { data: moved };
        res.json(payload);
      } catch (error) {
        next(error);
      }
    },
  );
}
