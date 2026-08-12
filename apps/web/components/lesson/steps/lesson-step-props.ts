import type { LessonDetailResponse } from "@kidlearn/types";

/**
 * The contract every one of the five steps is built against.
 *
 * Fixed here, in file 16, and deliberately narrow: a step receives the whole lesson
 * and one callback, and reports completion by calling it. Files 17–23 replace the
 * insides of each step without touching this — which is the point. A step that
 * needed to know its own index, or to advance the flow itself, would put the flow's
 * rules in five places instead of in `lesson-machine.ts`.
 *
 * `onComplete` takes no argument. What a step *produced* — a quiz score, a set of
 * answers — is reported to the server by the step itself (files 22–23), not carried
 * through the player, so that progress stays server-authoritative rather than
 * accumulating in client state on its way up.
 */
export interface LessonStepProps {
  lesson: LessonDetailResponse;
  onComplete: () => void;
}
