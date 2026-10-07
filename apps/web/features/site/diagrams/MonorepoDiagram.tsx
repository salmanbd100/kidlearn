import { DiagramArrow } from "./DiagramArrow";
import { DiagramBox } from "./DiagramBox";
import { DiagramFrame } from "./DiagramFrame";
import { DiagramLabel } from "./DiagramLabel";

// Edges follow each workspace's `@kidlearn/*` dependencies; long edges run down the gaps between columns.
const KEY_PREFIX = "diagrams.monorepo";

export function MonorepoDiagram() {
  return (
    <DiagramFrame
      titleKey={`${KEY_PREFIX}.title`}
      captionKey={`${KEY_PREFIX}.caption`}
      viewBox="0 0 380 425"
    >
      <DiagramLabel x={10} y={24} labelKey={`${KEY_PREFIX}.appsRow`} />
      <DiagramBox
        x={10}
        y={34}
        width={104}
        labelKey={`${KEY_PREFIX}.web`}
        captionKey={`${KEY_PREFIX}.webCaption`}
        tone="sky"
      />
      <DiagramBox
        x={138}
        y={34}
        width={104}
        labelKey={`${KEY_PREFIX}.mobile`}
        captionKey={`${KEY_PREFIX}.mobileCaption`}
        isPlanned
      />
      <DiagramBox
        x={266}
        y={34}
        width={104}
        labelKey={`${KEY_PREFIX}.server`}
        captionKey={`${KEY_PREFIX}.serverCaption`}
        tone="sky"
      />

      <DiagramLabel x={10} y={140} labelKey={`${KEY_PREFIX}.packagesRow`} />
      <DiagramBox
        x={10}
        y={150}
        width={104}
        labelKey={`${KEY_PREFIX}.ui`}
        captionKey={`${KEY_PREFIX}.uiCaption`}
        tone="coral"
      />
      <DiagramBox
        x={138}
        y={150}
        width={104}
        labelKey={`${KEY_PREFIX}.i18n`}
        captionKey={`${KEY_PREFIX}.i18nCaption`}
      />
      <DiagramBox
        x={266}
        y={150}
        width={104}
        labelKey={`${KEY_PREFIX}.db`}
        captionKey={`${KEY_PREFIX}.dbCaption`}
      />
      <DiagramBox
        x={10}
        y={262}
        width={104}
        labelKey={`${KEY_PREFIX}.tokens`}
        captionKey={`${KEY_PREFIX}.tokensCaption`}
      />
      <DiagramBox
        x={118}
        y={262}
        width={252}
        labelKey={`${KEY_PREFIX}.types`}
        captionKey={`${KEY_PREFIX}.typesCaption`}
        tone="sunshine"
      />
      <DiagramBox
        x={10}
        y={336}
        width={360}
        height={46}
        labelKey={`${KEY_PREFIX}.config`}
        captionKey={`${KEY_PREFIX}.configCaption`}
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
      <DiagramLabel x={52} y={414} labelKey={`${KEY_PREFIX}.legendImports`} />
      <DiagramArrow d="M190 410 H224" isPlanned />
      <DiagramLabel x={232} y={414} labelKey={`${KEY_PREFIX}.legendPlanned`} />
    </DiagramFrame>
  );
}
