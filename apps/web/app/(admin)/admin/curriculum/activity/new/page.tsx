import { NewActivityScreen } from "./NewActivityScreen";

/**
 * `/admin/curriculum/activity/new` — composing a new activity payload.
 *
 * A static segment, so it wins over `[activityId]` in Next's route matching and an
 * activity can never be given the id `new`.
 */
export default function NewActivityPage() {
  return <NewActivityScreen />;
}
