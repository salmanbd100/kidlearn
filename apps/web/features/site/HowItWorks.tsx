"use client";

import { cn } from "@kidlearn/ui";
import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { toNumeral } from "./HangingSection";
import { useIsMotionReducedAfterHydration } from "./use-is-motion-reduced-after-hydration";
import { useSiteTranslation } from "./use-site-translation";

const SPRING = { type: "spring", stiffness: 400, damping: 15 } as const;

/** Each picture plays once, when most of it is on screen, so a visitor sees it rather than misses it. */
const IN_VIEW = { once: true, amount: 0.6 } as const;

/** Under reduced motion the picture renders settled, in its final state, and never moves. */
function playOnce(isMotionReduced: boolean) {
  return {
    initial: isMotionReduced ? false : "from",
    animate: isMotionReduced ? "to" : undefined,
    whileInView: "to",
    viewport: IN_VIEW,
  } as const;
}

// Brand hues are allowed in the pictures: decorative art, not UI (design.md §2.2).
const STEPS = [
  { key: "pick", tint: "bg-sky/15", Picture: PickPicture },
  { key: "play", tint: "bg-grape/15", Picture: PlayPicture },
  { key: "stars", tint: "bg-sunshine/25", Picture: StarsPicture },
] as const;

export function HowItWorks() {
  const { t } = useSiteTranslation();
  const isMotionReduced = useIsMotionReducedAfterHydration();

  return (
    // Keyed so the flip to reduced motion remounts every picture settled rather than animating it.
    <ol
      key={isMotionReduced ? "still" : "moving"}
      className="grid gap-8 sm:grid-cols-3 sm:gap-6"
    >
      {STEPS.map(({ key, tint, Picture }, index) => (
        // Picture beside the words on a phone: three full-width tiles were a screen and a half of scrolling.
        <li
          key={key}
          className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-4 sm:flex sm:flex-col sm:items-stretch"
        >
          <div
            className={cn(
              "flex aspect-square items-center justify-center rounded-(--radius) p-3 sm:aspect-[4/3] sm:p-6",
              tint,
            )}
          >
            <Picture isMotionReduced={isMotionReduced} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-bold tabular-nums text-muted-foreground">
              {toNumeral(index)}
            </span>
            <h3 className="font-display text-2xl font-semibold">
              {t(`home.how.${key}.title`)}
            </h3>
            <p className="text-lg leading-relaxed text-muted-foreground">
              {t(`home.how.${key}.detail`)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Picture({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 160 120"
      className="h-full max-h-40 w-full"
    >
      {children}
    </svg>
  );
}

const FACES = [
  { cx: 26, fill: "fill-coral" },
  { cx: 80, fill: "fill-mint" },
  { cx: 134, fill: "fill-grape" },
] as const;

const CHOSEN_FACE: Variants = {
  from: { scale: 1, opacity: 0.5 },
  to: { scale: 1.15, opacity: 1 },
};
const OTHER_FACE: Variants = {
  from: { scale: 1, opacity: 0.5 },
  to: { scale: 0.9, opacity: 0.45 },
};

/** Three profile pictures; the middle one is chosen. */
function PickPicture({ isMotionReduced }: { isMotionReduced: boolean }) {
  return (
    <Picture>
      {FACES.map(({ cx, fill }, index) => {
        const isChosen = index === 1;
        return (
          // Drawn round 0,0 inside a translate, so the scale pivots on the face itself.
          <g key={cx} transform={`translate(${cx} 60)`}>
            <motion.g
              variants={isChosen ? CHOSEN_FACE : OTHER_FACE}
              {...playOnce(isMotionReduced)}
              transition={{ ...SPRING, delay: 0.3 }}
            >
              {isChosen ? (
                <circle
                  r="25"
                  className="fill-none stroke-ink"
                  strokeWidth="3"
                />
              ) : null}
              <circle r="19" className={fill} />
              <circle cx="-6" cy="-4" r="2.5" className="fill-ink" />
              <circle cx="6" cy="-4" r="2.5" className="fill-ink" />
              <path
                d="M-7 5 Q 0 12 7 5"
                className="fill-none stroke-ink"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </motion.g>
          </g>
        );
      })}
    </Picture>
  );
}

const TRACE: Variants = { from: { pathLength: 0 }, to: { pathLength: 1 } };

/** A letter A traced over its dotted guide, the way a tracing lesson plays. */
function PlayPicture({ isMotionReduced }: { isMotionReduced: boolean }) {
  const strokes = ["M50 100 L80 20 L110 100", "M62 70 L98 70"];

  return (
    <Picture>
      {strokes.map((d) => (
        <path
          key={`guide-${d}`}
          d={d}
          className="fill-none stroke-ink/30"
          strokeWidth="10"
          strokeDasharray="2 12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {strokes.map((d, index) => (
        <motion.path
          key={d}
          d={d}
          className="fill-none stroke-grape"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          variants={TRACE}
          {...playOnce(isMotionReduced)}
          transition={{ duration: 0.9, delay: 0.3 + index, ease: "easeInOut" }}
        />
      ))}
    </Picture>
  );
}

const STAR =
  "M0 -22 L6.5 -7.5 L22 -6.8 L10 3.7 L13.6 19.6 L0 11 L-13.6 19.6 L-10 3.7 L-22 -6.8 L-6.5 -7.5 Z";

const SMALL_STAR: Variants = {
  from: { scale: 0, rotate: -60 },
  to: { scale: 1, rotate: 0 },
};
const BIG_STAR: Variants = {
  from: { scale: 0, rotate: -60 },
  to: { scale: 1.3, rotate: 0 },
};

/** Three stars pop in, one after another, as a finished lesson awards them. */
function StarsPicture({ isMotionReduced }: { isMotionReduced: boolean }) {
  return (
    <Picture>
      {[36, 80, 124].map((x, index) => (
        <g key={x} transform={`translate(${x} ${index === 1 ? 52 : 66})`}>
          <motion.path
            d={STAR}
            className="fill-sunshine stroke-ink"
            strokeWidth="3"
            strokeLinejoin="round"
            variants={index === 1 ? BIG_STAR : SMALL_STAR}
            {...playOnce(isMotionReduced)}
            transition={{ ...SPRING, delay: 0.3 + 0.35 * index }}
          />
        </g>
      ))}
    </Picture>
  );
}
