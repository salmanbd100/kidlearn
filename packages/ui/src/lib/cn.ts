import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows Tailwind's default scale names; without these, `rounded-pill` and `shadow-pop` from
// tokens.css `@theme` are not recognised as conflicting with `rounded-*` / `shadow-*`, and both survive.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["pill"],
      shadow: ["pop"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
