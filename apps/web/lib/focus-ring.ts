/**
 * The visible focus ring `design.md §7` requires on every interactive element.
 *
 * There is no global `:focus-visible` rule — `globals.css` and the token sheet
 * both leave it to the component — so every element that is not a `Button` has to
 * carry it, and one that forgets falls back to the UA outline rather than
 * `--ring`. One string rather than eight copies of it, so a change to the ring is
 * a change in one place.
 */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
