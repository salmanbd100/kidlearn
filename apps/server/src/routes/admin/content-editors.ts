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
 *
 * **A second router at the same mount path as `adminContentRouter`**, rather than
 * more paths on that one. Express consults both in registration order, so the
 * paths are indistinguishable to a client, while the coverage walk in
 * `openapi/coverage.test.ts` — which reads a router's *own* registrations — sees
 * two surfaces it can document separately. Folding these into file 32's router
 * would also have meant folding them into its `mountResource` generator, whose
 * every operation assumes a slug, a parent and per-locale names; a quiz has none
 * of those.
 *
 * Mounted inside `adminRouter`, so `requireAdmin` guards every path by
 * construction.
 *
 * `status` is absent from every body here, exactly as in file 32: the transition
 * endpoints are the only door, and behind them is the same matrix. Publishing an
 * activity or quiz matters in its own right — the student lesson API gates
 * `Lesson.activity` and `Lesson.quiz` on their own status, so a published lesson
 * shows neither until each is published too.
 */
export const adminContentEditorsRouter = Router();

/**
 * Reads a uuid path parameter on a route guarded by the matching params schema.
 *
 * Express 5 types every param as `string | string[]`, because a repeated segment
 * can produce an array. The cast is safe only *after* that middleware ran: it
 * replaced `req.params` with the Zod-parsed object, or the request never reached
 * the handler (`400 VALIDATION_FAILED`). Same reasoning as `idParam` in
 * `routes/admin/content.ts`.
 */
function param(req: Request, name: "id" | "quizId"): string {
  return req.params[name] as string;
}

// --- Quizzes --------------------------------------------------------------

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

// --- Activities -----------------------------------------------------------

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

// --- Badges ---------------------------------------------------------------

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

// --- Transitions ----------------------------------------------------------

/**
 * The three resources share one transition handler, registered per segment.
 *
 * Two of them use `:id` and quizzes use `:quizId`, matching the path parameter
 * each resource's other operations already declare — so the OpenAPI registration
 * and the params schema stay one-to-one with the route rather than needing a
 * special case.
 */
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
