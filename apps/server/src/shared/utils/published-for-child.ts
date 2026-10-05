import type { ChildProfile, ContentStatus, GradeLevel } from "@kidlearn/db";

/** The ONE place the student-visibility rule lives (FR-CURR-02). */
export const PUBLISHED_STATUS = "published" as const satisfies ContentStatus;

export type PublishedForChildWhere = {
  readonly status: typeof PUBLISHED_STATUS;
  readonly gradeLevels: { readonly has: GradeLevel };
};

export function publishedForChild(child: ChildProfile): PublishedForChildWhere {
  return { status: PUBLISHED_STATUS, gradeLevels: { has: child.gradeLevel } };
}

/** For status-only content (`World`, a theming surface shared by every grade); its lessons are what get filtered. */
export const publishedOnly = { status: PUBLISHED_STATUS } as const;

/** To-one relation form: a published lesson on a draft world would otherwise serve unreviewed content. */
export const publishedRelation = { is: publishedOnly } as const;

export function publishedRelationForChild(child: ChildProfile): {
  readonly is: PublishedForChildWhere;
} {
  return { is: publishedForChild(child) };
}

/** Every gate a lesson is subject to: its own, its world's, its topic's and that subject's. Applied in one place because
 * `getLessonForChild` once checked only the first two, so a withdrawn topic's bookmarked lesson still played and paid out. */
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

/** Post-fetch form for an optional relation (`Lesson.activity`/`quiz`): an unpublished one is omitted rather than 404-ing the lesson. */
export function isPublished(
  row: { status: ContentStatus } | null | undefined,
): boolean {
  return row?.status === PUBLISHED_STATUS;
}
