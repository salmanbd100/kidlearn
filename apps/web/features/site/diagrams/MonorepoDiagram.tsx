import {
  DiagramArrow,
  DiagramBox,
  DiagramFrame,
  DiagramLabel,
} from "./DiagramParts";

// Edges follow each workspace's `@kidlearn/*` dependencies; long edges run down the gaps between columns.
const K = "diagrams.monorepo";

export function MonorepoDiagram() {
  return (
    <DiagramFrame
      titleKey={`${K}.title`}
      captionKey={`${K}.caption`}
      viewBox="0 0 380 425"
    >
      <DiagramLabel x={10} y={24} labelKey={`${K}.appsRow`} />
      <DiagramBox
        x={10}
        y={34}
        width={104}
        labelKey={`${K}.web`}
        captionKey={`${K}.webCaption`}
        tone="sky"
      />
      <DiagramBox
        x={138}
        y={34}
        width={104}
        labelKey={`${K}.mobile`}
        captionKey={`${K}.mobileCaption`}
        isPlanned
      />
      <DiagramBox
        x={266}
        y={34}
        width={104}
        labelKey={`${K}.server`}
        captionKey={`${K}.serverCaption`}
        tone="sky"
      />

      <DiagramLabel x={10} y={140} labelKey={`${K}.packagesRow`} />
      <DiagramBox
        x={10}
        y={150}
        width={104}
        labelKey={`${K}.ui`}
        captionKey={`${K}.uiCaption`}
        tone="coral"
      />
      <DiagramBox
        x={138}
        y={150}
        width={104}
        labelKey={`${K}.i18n`}
        captionKey={`${K}.i18nCaption`}
      />
      <DiagramBox
        x={266}
        y={150}
        width={104}
        labelKey={`${K}.db`}
        captionKey={`${K}.dbCaption`}
      />
      <DiagramBox
        x={10}
        y={262}
        width={104}
        labelKey={`${K}.tokens`}
        captionKey={`${K}.tokensCaption`}
      />
      <DiagramBox
        x={118}
        y={262}
        width={252}
        labelKey={`${K}.types`}
        captionKey={`${K}.typesCaption`}
        tone="sunshine"
      />
      <DiagramBox
        x={10}
        y={336}
        width={360}
        height={46}
        labelKey={`${K}.config`}
        captionKey={`${K}.configCaption`}
      />

      <DiagramArrow d="M62 88 V150" />
      <DiagramArrow d="M114 76 L172 150" />
      <DiagramArrow d="M104 88 L130 114 V262" />
      <DiagramArrow d="M318 88 V150" />
      <DiagramArrow d="M276 88 L260 104 V262" />
      <DiagramArrow d="M190 88 V150" isPlanned />
      <DiagramArrow d="M232 88 L248 104 V262" isPlanned />
      <DiagramArrow d="M146 88 L120 114 V240 L100 262" isPlanned />
      <DiagramArrow d="M62 204 V262" />
      <DiagramArrow d="M190 204 V262" />
      <DiagramArrow d="M318 204 V262" />

      <DiagramArrow d="M10 410 H44" />
      <DiagramLabel x={52} y={414} labelKey={`${K}.legendImports`} />
      <DiagramArrow d="M190 410 H224" isPlanned />
      <DiagramLabel x={232} y={414} labelKey={`${K}.legendPlanned`} />
    </DiagramFrame>
  );
}
