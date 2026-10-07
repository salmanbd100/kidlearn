import {
  DiagramArrow,
  DiagramBox,
  DiagramFrame,
  DiagramLabel,
} from "./DiagramParts";

// The happy path and the rework loop only; `archived` is a side exit the surrounding text names.
const K = "diagrams.lifecycle";

export function LifecycleDiagram() {
  return (
    <DiagramFrame
      titleKey={`${K}.title`}
      captionKey={`${K}.caption`}
      viewBox="0 0 380 375"
    >
      <DiagramBox
        x={20}
        y={10}
        width={160}
        height={50}
        labelKey={`${K}.draft`}
      />
      <DiagramArrow d="M100 60 V110" />
      <DiagramLabel x={112} y={90} labelKey={`${K}.submit`} />

      <DiagramBox
        x={20}
        y={110}
        width={160}
        height={50}
        labelKey={`${K}.inReview`}
      />
      <DiagramArrow d="M100 160 V210" />
      <DiagramLabel x={112} y={190} labelKey={`${K}.approve`} />
      <DiagramArrow d="M180 135 L290 210" />
      <DiagramLabel x={236} y={158} labelKey={`${K}.reject`} />

      <DiagramBox
        x={20}
        y={210}
        width={160}
        height={50}
        labelKey={`${K}.approved`}
        tone="sunshine"
      />
      <DiagramBox
        x={220}
        y={210}
        width={140}
        height={50}
        labelKey={`${K}.rejected`}
        tone="coral"
      />
      <DiagramArrow d="M330 210 V35 H180" />
      <DiagramLabel x={255} y={27} labelKey={`${K}.rework`} anchor="middle" />

      <DiagramArrow d="M100 260 V310" />
      <DiagramLabel x={112} y={290} labelKey={`${K}.publish`} />
      <DiagramBox
        x={20}
        y={310}
        width={160}
        height={56}
        labelKey={`${K}.published`}
        captionKey={`${K}.publishedCaption`}
        tone="mint"
      />
    </DiagramFrame>
  );
}
