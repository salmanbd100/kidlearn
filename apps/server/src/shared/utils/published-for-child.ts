import type { ChildProfile, ContentStatus, GradeLevel } from "@kidlearn/db";

/**
 * Spec §7.3.4 / FR-CURR-02 — the ONE place the student-visibility rule lives.
 */
export const PUBLISHED_STATUS = "published" as const satisfies ContentStatus;

export type PublishedForChildWhere = {
  readonly status: typeof PUBLISHED_STATUS;
  readonly gradeLevels: { readonly has: GradeLevel };
};

export function publishedForChild(child: ChildProfile): PublishedForChildWhere {
  return { status: PUBLISHED_STATUS, gradeLevels: { has: child.gradeLevel } };
}

/**
 * For content that carries a status but no grade tagging — `World` is the only
 * such model reached by this API. Worlds are a theming surface shared by every
 * grade; the lessons inside them are what get filtered (FR-WORLD-01..03).
 */
export const publishedOnly = { status: PUBLISHED_STATUS } as const;

/**
 * The same gate as a to-one relation filter, for a row whose visibility depends
 * on a row it points at. `Lesson.world` is the case this API has: the world
 * supplies child-facing name, palette and mascot, and it carries its own
 * `status`, so a published lesson hanging off a draft world would serve
 * unreviewed content.
 */
export const publishedRelation = { is: publishedOnly } as const;

/**
 * The grade-aware relation filter, for a to-one edge onto a row that *is* grade
 * tagged — `Lesson.topic` and `Topic.subject`.
 */
export function publishedRelationForChild(child: ChildProfile): {
  readonly is: PublishedForChildWhere;
} {
  return { is: publishedForChild(child) };
}

/**
 * **Every gate a lesson is subject to**, as one `where` fragment — the lesson's
 * own status and grade, its world's status, its topic's status and grade, and
 * that topic's subject's status and grade.
 *
 * All four gates in one place because they used to be in two: the world-screen
 * list applied all of them and `getLessonForChild` applied only the first two, so
 * withdrawing a *topic* to draft removed its lessons from every list while a
 * bookmarked lesson URL still played, still recorded progress and still paid out.
 * A lesson is not visible on its own merits — its curriculum position is part of
 * the claim that it is for this child (`openapi/paths/content.ts`, the
 * `/worlds/{id}/lessons` description).
 */
export function visibleLessonWhere(child: ChildProfile): {
  readonly status: typeof PUBLISHED_STATUS;
  readonly gradeLevels: { readonly has: GradeLevel };
  readonly world: typeof publishedRelation;
  readonly topic: {
    readonly is: PublishedForChildWhere & {
      readonly subject: { readonly is: PublishedForChildWhere };
    };
  };
} {
  const visible = publishedForChild(child);
  return {
    ...visible,
    world: publishedRelation,
    topic: { is: { ...visible, subject: publishedRelationForChild(child) } },
  };
}

/**
 * Post-fetch form of the same rule, for an **optional** relation that must not
 * take its parent down with it. `Lesson.activity` and `Lesson.quiz` are both
 * nullable and the lesson player already renders a lesson without either, so an
 * unpublished one is omitted from the response rather than 404-ing the lesson.
 */
export function isPublished(
  row: { status: ContentStatus } | null | undefined,
): boolean {
  return row?.status === PUBLISHED_STATUS;
}
