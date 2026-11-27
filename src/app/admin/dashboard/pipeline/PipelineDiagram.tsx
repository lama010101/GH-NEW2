import {
  PIPELINE_STEP_BY_ID,
  PIPELINE_STATUSES,
  STATUS_LABELS,
  type PipelineStatus,
} from "@/core/pipelineRegistry";
import styles from "./pipeline.module.css";

export const PIPELINE_DIAGRAM_NODE_IDS = [
  "legacy-events-pool",
  "worker-fact-checks",
  "wikidata-matcher",
  "wikidata-harvest",
  "narration-and-hints",
  "verify-engine",
  "reliability-score",
  "image-generation",
  "image-chrono-audit",
  "ready-gate",
  "translation",
  "in-play",
] as const;

const NODE_W = 138;
const NODE_H = 62;
const LANE_NODE_W = 160;
const SPINE_Y = 360;
const SPINE_START_X = 420;
const SPINE_GAP = 22;
const SPINE_STEP = NODE_W + SPINE_GAP;

const POSITIONS: Record<(typeof PIPELINE_DIAGRAM_NODE_IDS)[number], { x: number; y: number; w: number }> = {
  "legacy-events-pool": { x: 20, y: 90, w: LANE_NODE_W },
  "worker-fact-checks": { x: 220, y: 35, w: LANE_NODE_W },
  "wikidata-matcher": { x: 220, y: 145, w: LANE_NODE_W },
  "wikidata-harvest": { x: 20, y: 260, w: LANE_NODE_W },
  "narration-and-hints": { x: 220, y: 260, w: LANE_NODE_W },
  "verify-engine": { x: SPINE_START_X, y: SPINE_Y, w: NODE_W },
  "reliability-score": { x: SPINE_START_X + SPINE_STEP, y: SPINE_Y, w: NODE_W },
  "image-generation": { x: SPINE_START_X + SPINE_STEP * 2, y: SPINE_Y, w: NODE_W },
  "image-chrono-audit": { x: SPINE_START_X + SPINE_STEP * 3, y: SPINE_Y, w: NODE_W },
  "ready-gate": { x: SPINE_START_X + SPINE_STEP * 4, y: SPINE_Y, w: NODE_W },
  translation: { x: SPINE_START_X + SPINE_STEP * 5, y: SPINE_Y, w: NODE_W },
  "in-play": { x: SPINE_START_X + SPINE_STEP * 6, y: SPINE_Y, w: NODE_W },
};

const STATUS_COLOR: Record<PipelineStatus, string> = {
  planned: "var(--ops-mute)",
  in_progress: "var(--ops-warn)",
  built_dark: "var(--ops-warn)",
  live: "var(--ops-ok)",
  blocked: "var(--ops-bad)",
  superseded: "var(--ops-line)",
};

function wrapTitle(title: string): string[] {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 18 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function DiagramNode({ id }: { id: (typeof PIPELINE_DIAGRAM_NODE_IDS)[number] }) {
  const step = PIPELINE_STEP_BY_ID[id];
  const pos = POSITIONS[id];
  const lines = wrapTitle(step.title);
  return (
    <a href={`/admin/dashboard/pipeline/stages#${step.id}`}>
      <g className={styles.diagramNode}>
        <rect x={pos.x} y={pos.y} width={pos.w} height={NODE_H} rx="5" />
        <text className={styles.diagramNodeTitle} x={pos.x + 8} y={pos.y + 17}>
          {lines.map((line, index) => (
            <tspan key={line} x={pos.x + 8} dy={index === 0 ? 0 : 12}>
              {line}
            </tspan>
          ))}
        </text>
        <circle cx={pos.x + 11} cy={pos.y + 49} r="4" fill={STATUS_COLOR[step.status]} />
        <text className={styles.diagramNodeStatus} x={pos.x + 20} y={pos.y + 53}>
          {STATUS_LABELS[step.status]}
        </text>
      </g>
    </a>
  );
}

function Arrow({ d }: { d: string }) {
  return <path className={styles.diagramArrow} d={d} />;
}

export function PipelineDiagram() {
  const spineIds = [
    "verify-engine",
    "reliability-score",
    "image-generation",
    "image-chrono-audit",
    "ready-gate",
    "translation",
    "in-play",
  ] as const;

  return (
    <div className={styles.diagramScroll} aria-label="Pipeline diagram">
      <svg
        className={styles.diagram}
        viewBox="0 0 1560 535"
        role="img"
        aria-labelledby="pipeline-diagram-title pipeline-diagram-desc"
      >
        <title id="pipeline-diagram-title">Metadata and image pipeline diagram</title>
        <desc id="pipeline-diagram-desc">
          Existing events and new generation events converge on the shared verification, reliability, image, ready-gate, translation, and in-play spine.
        </desc>
        <defs>
          <marker id="pipeline-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--ops-mute)" />
          </marker>
        </defs>

        <text className={styles.diagramLaneLabel} x="20" y="24">
          Lane A — Existing events
        </text>
        <text className={styles.diagramLaneLabel} x="20" y="248">
          Lane B — New events
        </text>
        <text className={styles.diagramLaneLabel} x="420" y="348">
          Shared spine
        </text>

        <Arrow d="M 180 122 C 195 122 200 66 220 66" />
        <Arrow d="M 180 122 C 195 122 200 176 220 176" />
        <Arrow d="M 380 66 C 402 66 390 350 420 374" />
        <Arrow d="M 380 176 C 402 176 398 330 420 360" />
        <Arrow d="M 180 291 L 220 291" />
        <Arrow d="M 380 291 C 405 291 398 340 420 366" />
        {spineIds.slice(0, -1).map((id, index) => {
          const x1 = SPINE_START_X + index * SPINE_STEP + NODE_W;
          const x2 = SPINE_START_X + (index + 1) * SPINE_STEP;
          const y = SPINE_Y + NODE_H / 2;
          return <Arrow key={id} d={`M ${x1} ${y} L ${x2} ${y}`} />;
        })}

        {PIPELINE_DIAGRAM_NODE_IDS.map((id) => (
          <DiagramNode key={id} id={id} />
        ))}

        <text className={styles.diagramLegend} x="20" y="488">
          Legend: every node label comes from src/core/pipelineRegistry.ts; dot plus text is the declared status. Select a node to open its stage detail.
        </text>
        {PIPELINE_STATUSES.map((status, index) => (
          <g key={status} transform={`translate(${20 + index * 125}, 505)`}>
            <circle cx="5" cy="0" r="4" fill={STATUS_COLOR[status]} />
            <text className={styles.diagramLegend} x="14" y="4">
              {STATUS_LABELS[status]}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
