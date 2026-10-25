import type { ComponentProps } from "react";
import { Doodle } from "../Doodle";
import { Reveal } from "./Reveal";

/** A homepage section heading with its hand-drawn squiggle; the squiggle's tone tells sections apart. */
export function HomeSectionTitle({
  id,
  tone,
  children,
}: {
  id: string;
  tone: ComponentProps<typeof Doodle>["tone"];
  children: string;
}) {
  return (
    <Reveal className="flex items-center gap-3">
      <h2 id={id} className="font-display text-3xl font-semibold sm:text-4xl">
        {children}
      </h2>
      <Doodle kind="squiggle" tone={tone} />
    </Reveal>
  );
}
