import type { ChildProfile, GradeLevel } from "@kidlearn/db";

/**
 * Spec §7.3.4 / FR-CURR-02 — the ONE place the student-visibility rule lives.
 *
 * Every student-facing content query composes one of the two exports below. No
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
export type PublishedForChildWhere = {
  readonly status: "published";
  readonly gradeLevels: { readonly has: GradeLevel };
};

export function publishedForChild(child: ChildProfile): PublishedForChildWhere {
  return { status: "published", gradeLevels: { has: child.gradeLevel } };
}

/**
 * For content that carries a status but no grade tagging — `World` is the only
 * such model reached by this API. Worlds are a theming surface shared by every
 * grade; the lessons inside them are what get filtered (FR-WORLD-01..03).
 */
export const publishedOnly = { status: "published" } as const;
