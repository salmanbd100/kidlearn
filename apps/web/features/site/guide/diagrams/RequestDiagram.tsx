import { DiagramArrow } from "./DiagramArrow";
import { DiagramBox } from "./DiagramBox";
import { DiagramFrame } from "./DiagramFrame";
import { DiagramLabel } from "./DiagramLabel";

// Vercel serves the pages, but the browser calls the API origin itself — there is no Next.js proxy in the path.
const KEY_PREFIX = "diagrams.request";

export function RequestDiagram() {
  return (
    <DiagramFrame
      titleKey={`${KEY_PREFIX}.title`}
      captionKey={`${KEY_PREFIX}.caption`}
      viewBox="0 0 380 510"
    >
      <DiagramBox
        x={10}
        y={10}
        width={170}
        height={58}
        labelKey={`${KEY_PREFIX}.browser`}
        captionKey={`${KEY_PREFIX}.browserCaption`}
        tone="sky"
      />
      <DiagramBox
        x={200}
        y={10}
        width={170}
        height={58}
        labelKey={`${KEY_PREFIX}.vercel`}
        captionKey={`${KEY_PREFIX}.vercelCaption`}
      />
      <DiagramArrow d="M200 39 H180" />

      <DiagramArrow d="M95 68 V140" />
      <DiagramLabel x={107} y={109} labelKey={`${KEY_PREFIX}.cookie`} />

      <DiagramBox
        x={10}
        y={140}
        width={360}
        height={58}
        labelKey={`${KEY_PREFIX}.caddy`}
        captionKey={`${KEY_PREFIX}.caddyCaption`}
      />
      <DiagramArrow d="M190 198 V240" />
      <DiagramBox
        x={10}
        y={240}
        width={360}
        height={58}
        labelKey={`${KEY_PREFIX}.express`}
        captionKey={`${KEY_PREFIX}.expressCaption`}
        tone="sunshine"
      />
      <DiagramArrow d="M190 298 V340" />
      <DiagramBox
        x={10}
        y={340}
        width={360}
        height={58}
        labelKey={`${KEY_PREFIX}.prisma`}
        captionKey={`${KEY_PREFIX}.prismaCaption`}
      />
      <DiagramArrow d="M190 398 V440" />
      <DiagramBox
        x={10}
        y={440}
        width={360}
        height={58}
        labelKey={`${KEY_PREFIX}.postgres`}
        captionKey={`${KEY_PREFIX}.postgresCaption`}
        tone="mint"
      />
    </DiagramFrame>
  );
}
