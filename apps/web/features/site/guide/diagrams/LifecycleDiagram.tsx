import { DiagramArrow } from "./DiagramArrow";
import { DiagramBox } from "./DiagramBox";
import { DiagramFrame } from "./DiagramFrame";
import { DiagramLabel } from "./DiagramLabel";

// The happy path and the rework loop only; `archived` is a side exit the surrounding text names.
const KEY_PREFIX = "diagrams.lifecycle";

export function LifecycleDiagram() {
  return (
    <DiagramFrame
      titleKey={`${KEY_PREFIX}.title`}
      captionKey={`${KEY_PREFIX}.caption`}
      viewBox="0 0 380 375"
    >
      <DiagramBox
        x={20}
        y={10}
        width={160}
        height={50}
        labelKey={`${KEY_PREFIX}.draft`}
      />
      <DiagramArrow d="M100 60 V110" />
      <DiagramLabel x={112} y={90} labelKey={`${KEY_PREFIX}.submit`} />

      <DiagramBox
        x={20}
        y={110}
        width={160}
        height={50}
        labelKey={`${KEY_PREFIX}.inReview`}
      />
      <DiagramArrow d="M100 160 V210" />
      <DiagramLabel x={112} y={190} labelKey={`${KEY_PREFIX}.approve`} />
      <DiagramArrow d="M180 135 L290 210" />
      <DiagramLabel x={236} y={158} labelKey={`${KEY_PREFIX}.reject`} />

      <DiagramBox
        x={20}
        y={210}
        width={160}
        height={50}
        labelKey={`${KEY_PREFIX}.approved`}
        tone="sunshine"
      />
      <DiagramBox
        x={220}
        y={210}
        width={140}
        height={50}
        labelKey={`${KEY_PREFIX}.rejected`}
        tone="coral"
      />
      <DiagramArrow d="M330 210 V35 H180" />
      <DiagramLabel
        x={255}
        y={27}
        labelKey={`${KEY_PREFIX}.rework`}
        anchor="middle"
      />

      <DiagramArrow d="M100 260 V310" />
      <DiagramLabel x={112} y={290} labelKey={`${KEY_PREFIX}.publish`} />
      <DiagramBox
        x={20}
        y={310}
        width={160}
        height={56}
        labelKey={`${KEY_PREFIX}.published`}
        captionKey={`${KEY_PREFIX}.publishedCaption`}
        tone="mint"
      />
    </DiagramFrame>
  );
}
