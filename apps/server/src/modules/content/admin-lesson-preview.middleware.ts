import type { Locale } from "@kidlearn/types";
import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { auth } from "../../config/auth.js";
import { prisma } from "../../config/prisma.js";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";
import { isAdminSessionExpired } from "../../shared/middleware/require-admin.js";
import { ContentIdParamsSchema } from "./content.schema.js";
import { getLessonForPreview, type LessonDetail } from "./content.service.js";

const LESSON_DETAIL_PATH = /^\/lessons\/([^/]+)$/;

export const adminLessonPreview: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Cheapest checks first: ordinary student requests exit here without touching the session store or database.
    if (req.method !== "GET" || req.query.preview !== "1") return next();

    const matched = LESSON_DETAIL_PATH.exec(req.path);
    if (!matched) return next();

    const params = ContentIdParamsSchema.safeParse({ id: matched[1] });
    // A malformed id falls through, so an unauthenticated caller meets `requireParent`'s `401` first.
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

// Also null for a session past `requireAdmin`'s age limit, which falls through like any non-admin.
async function findAdminForSession(req: Request) {
  const authenticated = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!authenticated || isAdminSessionExpired(authenticated.session)) {
    return null;
  }

  return prisma.adminUser.findUnique({
    where: { authUserId: authenticated.user.id },
  });
}

function previewLanguage(value: unknown): Locale {
  return value === "bn" ? "bn" : "en";
}
