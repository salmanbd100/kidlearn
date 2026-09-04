import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { auth } from "../lib/auth.js";
import type { SuccessEnvelope } from "../lib/errors.js";
import type { Lang } from "../lib/locale.js";
import { prisma } from "../lib/prisma.js";
import { ContentIdParamsSchema } from "../schemas/content.js";
import {
  getLessonForPreview,
  type LessonDetail,
} from "../services/contentService.js";

// `GET /api/content/lessons/:id?preview=1` for administrators (FR-CMS-04).

/** `/lessons/<id>` relative to the `/api/content` mount, and nothing else. */
const LESSON_DETAIL_PATH = /^\/lessons\/([^/]+)$/;

export const adminLessonPreview: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Cheapest checks first: every ordinary student request leaves this
    // middleware on one of the next three lines, without touching the session
    // store or the database.
    if (req.method !== "GET" || req.query.preview !== "1") return next();

    const matched = LESSON_DETAIL_PATH.exec(req.path);
    if (!matched) return next();

    const params = ContentIdParamsSchema.safeParse({ id: matched[1] });
    // A malformed id falls through rather than answering `400` here, so an
    // unauthenticated caller still meets `requireParent`'s `401` first and learns
    // nothing from the shape of its own typo.
    if (!params.success) return next();

    const admin = await findAdminForSession(req);
    if (!admin) return next();

    const lesson = await getLessonForPreview(
      params.data.id,
      previewLanguage(req.query.lang),
      req.log,
    );

    const body: SuccessEnvelope<{ lesson: LessonDetail }> = {
      data: { lesson },
    };
    res.json(body);
  } catch (error) {
    next(error);
  }
};

/** The `AdminUser` row behind the session, or `null`. */
async function findAdminForSession(req: Request) {
  const authenticated = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!authenticated) return null;

  return prisma.adminUser.findUnique({
    where: { authUserId: authenticated.user.id },
  });
}

/** Which locale to render the preview in. */
function previewLanguage(value: unknown): Lang {
  return value === "bn" ? "bn" : "en";
}
