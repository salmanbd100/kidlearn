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

/**
 * `GET /api/content/lessons/:id?preview=1` for administrators (FR-CMS-04).
 *
 * **Why a middleware in front of the student guards rather than a branch inside
 * the route.** The whole `/api/content` surface is mounted behind `requireParent`
 * and `requireActiveChild`, and an admin satisfies neither: they have no Google
 * account, so `findOrCreateParentForUser` refuses to provision a `Parent`, and no
 * child profile for `requireActiveChild` to resolve. A `?preview=1` branch inside
 * the handler could never run — the request would have been rejected two layers
 * earlier. So the interception has to happen before those guards, and it does so
 * on one exact shape of request.
 *
 * **The query parameter requests the mode; the session grants it.** Three things
 * have to hold before a single unpublished byte is read: the path is exactly one
 * lesson detail, `preview=1` is present, and an `AdminUser` row backs the session.
 * Miss any of them — including a *parent* who has typed `?preview=1` themselves —
 * and this calls `next()`, handing the request to the ordinary guarded route,
 * which answers `404` for a draft lesson exactly as it does today. There is no
 * path through this file that widens what a child or a parent can see.
 *
 * **Nothing is written.** No progress row, no `SessionEvent`, no screen-time
 * accounting: this is a read, and the endpoints that record any of those are all
 * behind `requireParent` + `requireActiveChild`, which an admin session cannot
 * pass. The player suppresses those calls in preview mode as well
 * (`components/lesson/LessonPlayer.tsx`), but the server-side impossibility is
 * what the guarantee rests on.
 *
 * `enforceScreenTime` is skipped along with the rest of the route, which is
 * correct: a parental daily limit is about a child's day, and there is no child
 * here.
 */

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

/**
 * The `AdminUser` row behind the session, or `null`.
 *
 * The same two steps `requireAdmin` performs, and deliberately not a call into it:
 * that middleware *throws* a `401`/`403`, which is right for `/api/admin/*` and
 * wrong here — a caller who is not an admin has to continue to the student route
 * and be answered by it.
 */
async function findAdminForSession(req: Request) {
  const authenticated = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!authenticated) return null;

  return prisma.adminUser.findUnique({
    where: { authUserId: authenticated.user.id },
  });
}

/**
 * Which locale to render the preview in.
 *
 * A parameter because there is no child row to read one from, and total rather
 * than validated: an unrecognised value previews in English instead of failing,
 * since the alternative is an admin meeting a `400` for a typo in a URL they are
 * only looking at. The CMS sends `en` or `bn` explicitly.
 */
function previewLanguage(value: unknown): Lang {
  return value === "bn" ? "bn" : "en";
}
