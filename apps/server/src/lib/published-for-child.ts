import type { ChildProfile, ContentStatus, GradeLevel } from "@kidlearn/db";

/**
 * Spec §7.3.4 / FR-CURR-02 — the ONE place the student-visibility rule lives.
 *
 * Every student-facing content query composes one of the exports below. No
 * route, service, or middleware may hand-write `status:` or `gradeLevels:`
 * conditions of its own: a single definition is what makes the content-safety
 * guard reviewable and greppable (`backend.md §4`).
 *
 * Deviation from the implementation spec: the settled schema grade-tags
 * `Subject` and `Topic` as well as `Lesson`, so `publishedForChild` is reused
 * for all three rather than only for lessons. The returned shape is structurally
 * assignable to `Prisma.LessonWhereInput`, `Prisma.SubjectWhereInput` and
 * `Prisma.TopicWhereInput` alike, which is why it is typed literally here
 * instead of being pinned to one of them.
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
 *
 * Prisma cannot filter an `include`, so the condition has to sit in `where` —
 * which means the unpublished parent takes the lesson down with it and the
 * child gets a 404. That is the fail-closed answer, and it keeps the list and
 * detail endpoints agreeing about what exists.
 */
export const publishedRelation = { is: publishedOnly } as const;

/**
 * The grade-aware relation filter, for a to-one edge onto a row that *is* grade
 * tagged — `Lesson.topic` and `Topic.subject`.
 *
 * `publishedRelation` above is not enough for those: a lesson tagged KG-1 can
 * hang off a topic tagged NURSERY only, and serving it because the lesson's own
 * tags matched would show a child content its curriculum position says is not
 * for them. Composed rather than written inline for the reason this whole module
 * exists — every visibility condition in the codebase reads from one file.
 */
export function publishedRelationForChild(child: ChildProfile): {
  readonly is: PublishedForChildWhere;
} {
  return { is: publishedForChild(child) };
}

/**
 * Post-fetch form of the same rule, for an **optional** relation that must not
 * take its parent down with it. `Lesson.activity` and `Lesson.quiz` are both
 * nullable and the lesson player already renders a lesson without either, so an
 * unpublished one is omitted from the response rather than 404-ing the lesson.
 *
 * Use this and never an inline `=== "published"`: `backend.md §4` is only
 * auditable while every status decision in the codebase reads from this file.
 */
export function isPublished(
  row: { status: ContentStatus } | null | undefined,
): boolean {
  return row?.status === PUBLISHED_STATUS;
}
