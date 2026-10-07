import {
  DiagramArrow,
  DiagramBox,
  DiagramFrame,
  DiagramLabel,
} from "./DiagramParts";

// Vercel serves the pages, but the browser calls the API origin itself — there is no Next.js proxy in the path.
const K = "diagrams.request";

export function RequestDiagram() {
  return (
    <DiagramFrame
      titleKey={`${K}.title`}
      captionKey={`${K}.caption`}
      viewBox="0 0 380 510"
    >
      <DiagramBox
        x={10}
        y={10}
        width={170}
        height={58}
        labelKey={`${K}.browser`}
        captionKey={`${K}.browserCaption`}
        tone="sky"
      />
      <DiagramBox
        x={200}
        y={10}
        width={170}
        height={58}
        labelKey={`${K}.vercel`}
        captionKey={`${K}.vercelCaption`}
      />
      <DiagramArrow d="M200 39 H180" />

      <DiagramArrow d="M95 68 V140" />
      <DiagramLabel x={107} y={109} labelKey={`${K}.cookie`} />

      <DiagramBox
        x={10}
        y={140}
        width={360}
        height={58}
        labelKey={`${K}.caddy`}
        captionKey={`${K}.caddyCaption`}
      />
      <DiagramArrow d="M190 198 V240" />
      <DiagramBox
        x={10}
        y={240}
        width={360}
        height={58}
        labelKey={`${K}.express`}
        captionKey={`${K}.expressCaption`}
        tone="sunshine"
      />
      <DiagramArrow d="M190 298 V340" />
      <DiagramBox
        x={10}
        y={340}
        width={360}
        height={58}
        labelKey={`${K}.prisma`}
        captionKey={`${K}.prismaCaption`}
      />
      <DiagramArrow d="M190 398 V440" />
      <DiagramBox
        x={10}
        y={440}
        width={360}
        height={58}
        labelKey={`${K}.postgres`}
        captionKey={`${K}.postgresCaption`}
        tone="mint"
      />
    </DiagramFrame>
  );
}
