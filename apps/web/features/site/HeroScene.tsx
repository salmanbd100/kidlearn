"use client";

import { cn } from "@kidlearn/ui";
import { motion, useAnimate } from "motion/react";
import { useIsMotionReducedAfterHydration } from "./use-is-motion-reduced-after-hydration";

const SPRING = { type: "spring", stiffness: 400, damping: 15 } as const;

// Brand hues are allowed here: this is decorative art, not UI (design.md §2.2).
const BLOCKS = [
  { glyph: "A", x: 70, y: 232, fill: "fill-sky", text: "fill-ink" },
  { glyph: "1", x: 160, y: 232, fill: "fill-coral", text: "fill-ink" },
  { glyph: "অ", x: 250, y: 232, fill: "fill-grape", text: "fill-cream" },
  { glyph: "B", x: 115, y: 146, fill: "fill-mint", text: "fill-ink" },
  { glyph: "2", x: 205, y: 146, fill: "fill-sunshine", text: "fill-ink" },
  { glyph: "আ", x: 160, y: 60, fill: "fill-blossom", text: "fill-cream" },
] as const;

const BLOCK_SIZE = 80;

const SUN_RAYS = Array.from({ length: 8 }, (_, index) => {
  const angle = (index * Math.PI) / 4;
  const point = (radius: number) =>
    `${(338 + radius * Math.cos(angle)).toFixed(1)} ${(58 + radius * Math.sin(angle)).toFixed(1)}`;
  return `M${point(44)} L${point(54)}`;
}).join(" ");

/**
 * The homepage's picture: a stack of letter and number blocks, English and Bangla together. Blocks
 * drop in once, bottom row first, and bounce when tapped. Decorative, so hidden from assistive tech.
 */
export function HeroScene({ className }: { className?: string }) {
  const isMotionReduced = useIsMotionReducedAfterHydration();

  return (
    // Plays when the scene scrolls into view: on a phone it sits below the actions, out of sight on load.
    <motion.svg
      key={isMotionReduced ? "still" : "moving"}
      initial={isMotionReduced ? false : "from"}
      animate={isMotionReduced ? "to" : undefined}
      whileInView="to"
      viewport={{ once: true, amount: 0.4 }}
      aria-hidden="true"
      focusable="false"
      data-testid="hero-scene"
      viewBox="0 0 400 360"
      className={cn("h-auto w-full touch-manipulation select-none", className)}
    >
      <circle cx="338" cy="58" r="34" className="fill-sunshine" />
      <path
        d={SUN_RAYS}
        className="stroke-sunshine"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M0 330 C 80 292, 150 300, 210 316 S 340 300, 400 318 L 400 360 L 0 360 Z"
        className="fill-mint/30"
      />
      {BLOCKS.map((block, index) => (
        <Block
          key={block.glyph}
          {...block}
          order={index}
          isMotionReduced={isMotionReduced}
        />
      ))}
      <g transform="translate(-296 -70)">
        <motion.path
          d="M352 196 L358 212 L375 213 L362 224 L366 241 L352 231 L338 241 L342 224 L329 213 L346 212 Z"
          className="fill-sunshine stroke-ink transform-fill origin-center"
          strokeWidth="2.5"
          strokeLinejoin="round"
          variants={{
            from: { scale: 0, rotate: -45 },
            to: {
              scale: 1,
              rotate: 0,
              transition: { ...SPRING, delay: 0.15 * BLOCKS.length },
            },
          }}
        />
      </g>
    </motion.svg>
  );
}

function Block({
  glyph,
  x,
  y,
  fill,
  text,
  order,
  isMotionReduced,
}: (typeof BLOCKS)[number] & { order: number; isMotionReduced: boolean }) {
  const [scope, animate] = useAnimate<SVGGElement>();

  function bounce() {
    if (isMotionReduced) return;
    void animate(
      scope.current,
      { y: [0, -28, 0], rotate: [0, -10, 8, 0] },
      { duration: 0.5, ease: [0.2, 0, 0, 1] },
    );
  }

  return (
    <motion.g
      variants={{
        from: { y: -320, opacity: 0 },
        to: {
          y: 0,
          opacity: 1,
          transition: { ...SPRING, delay: 0.15 * order },
        },
      }}
    >
      <g
        ref={scope}
        onPointerDown={bounce}
        className="cursor-pointer transform-fill origin-center"
      >
        <rect
          x={x}
          y={y}
          width={BLOCK_SIZE}
          height={BLOCK_SIZE}
          rx="16"
          className={cn(fill, "stroke-ink")}
          strokeWidth="3"
        />
        <text
          x={x + BLOCK_SIZE / 2}
          y={y + BLOCK_SIZE / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className={cn(text, "font-display text-[44px] font-semibold")}
        >
          {glyph}
        </text>
      </g>
    </motion.g>
  );
}
