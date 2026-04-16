import type { CSSProperties, ReactNode } from "react";

/**
 * Moonstone viz primitives — zero-dependency inline SVG components.
 *
 * These are intentionally small and uncharting-library-like. They
 * read the moonstone palette straight from CSS custom properties, so
 * they always match the rest of the hub without theming props.
 *
 * When a real charting surface is needed (axis ticks, legends,
 * tooltips, interactive selection), prefer building that on top of
 * these primitives or a dedicated component, not by pulling in a
 * heavyweight library. The hub aesthetic is calibrated, not decorated.
 */

/* ============================================================
 * Sparkline — a single-series trend line with optional area fill.
 * ============================================================ */
export interface SparklineProps {
  values: number[];
  /** Total width in px. Defaults to 120. */
  width?: number;
  /** Total height in px. Defaults to 36. */
  height?: number;
  /** Stroke color. Defaults to `var(--cm-metal-400)`. */
  stroke?: string;
  /** If true, a faint area fill is drawn below the line. */
  filled?: boolean;
  /** Accessible label describing the metric. */
  ariaLabel?: string;
  className?: string;
}

export function Sparkline({
  values,
  width = 120,
  height = 36,
  stroke = "var(--cm-metal-400)",
  filled = true,
  ariaLabel,
  className,
}: SparklineProps) {
  if (!values || values.length === 0) {
    return null;
  }

  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;

  const points = values.map((value, index) => {
    const x = pad + index * stepX;
    const y = pad + innerH - ((value - min) / range) * innerH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const linePath = `M ${points.join(" L ")}`;
  const areaPath = filled
    ? `${linePath} L ${(pad + innerW).toFixed(2)},${(pad + innerH).toFixed(2)} L ${pad.toFixed(
        2,
      )},${(pad + innerH).toFixed(2)} Z`
    : null;

  const last = values[values.length - 1];
  const lastX = pad + (values.length - 1) * stepX;
  const lastY = pad + innerH - ((last - min) / range) * innerH;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      style={{ display: "block", overflow: "visible" }}
    >
      {areaPath ? (
        <path d={areaPath} fill={stroke} opacity={0.12} stroke="none" />
      ) : null}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
    </svg>
  );
}

/* ============================================================
 * PipelineBar — horizontal stacked bar for funnel-style counts.
 * ============================================================ */
export interface PipelineSegment {
  label: string;
  value: number;
  tone?: "accent" | "muted" | "warn" | "risk" | "ok";
}

export interface PipelineBarProps {
  segments: PipelineSegment[];
  /** Height in px. Defaults to 10. */
  height?: number;
  ariaLabel?: string;
  className?: string;
}

const PIPELINE_TONE_FILL: Record<NonNullable<PipelineSegment["tone"]>, string> = {
  accent: "var(--cm-metal-400)",
  muted: "rgba(255, 255, 255, 0.22)",
  warn: "var(--cm-warn-500)",
  risk: "var(--cm-risk-500)",
  ok: "var(--cm-ok-500)",
};

export function PipelineBar({
  segments,
  height = 10,
  ariaLabel,
  className,
}: PipelineBarProps) {
  const total = segments.reduce((acc, segment) => acc + Math.max(0, segment.value), 0);

  if (total <= 0) {
    return (
      <div
        className={className}
        role="img"
        aria-label={ariaLabel}
        style={{
          height,
          borderRadius: 999,
          background: "rgba(255, 255, 255, 0.04)",
          border: "1px solid var(--cm-line-dark)",
        }}
      />
    );
  }

  return (
    <div
      className={className}
      role="img"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        height,
        borderRadius: 999,
        overflow: "hidden",
        background: "rgba(255, 255, 255, 0.04)",
      }}
    >
      {segments.map((segment) => {
        const width = (Math.max(0, segment.value) / total) * 100;
        if (width === 0) return null;
        const fill = PIPELINE_TONE_FILL[segment.tone ?? "accent"];
        return (
          <span
            key={segment.label}
            title={`${segment.label} · ${segment.value}`}
            style={{
              width: `${width}%`,
              background: fill,
              borderRight: "1px solid rgba(12, 16, 24, 0.55)",
            }}
          />
        );
      })}
    </div>
  );
}

/* ============================================================
 * DistributionDots — plot a list of values on a horizontal axis.
 * Good for PR ages, latency buckets, etc.
 * ============================================================ */
export interface DistributionDot {
  value: number;
  /** Optional bucket label rendered on hover / for a11y. */
  label?: string;
  tone?: "accent" | "warn" | "risk" | "ok";
}

export interface DistributionDotsProps {
  dots: DistributionDot[];
  /** Total width in px. Defaults to 280. */
  width?: number;
  /** Total height in px. Defaults to 44. */
  height?: number;
  /** Explicit min on the x-axis. Defaults to 0. */
  min?: number;
  /** Explicit max on the x-axis. Defaults to max(dots) rounded up. */
  max?: number;
  /** Optional tick labels rendered under the axis. */
  ticks?: { value: number; label: string }[];
  ariaLabel?: string;
  className?: string;
}

const DOT_TONE_FILL: Record<NonNullable<DistributionDot["tone"]>, string> = {
  accent: "var(--cm-metal-400)",
  warn: "var(--cm-warn-500)",
  risk: "var(--cm-risk-500)",
  ok: "var(--cm-ok-500)",
};

export function DistributionDots({
  dots,
  width = 280,
  height = 44,
  min = 0,
  max,
  ticks,
  ariaLabel,
  className,
}: DistributionDotsProps) {
  if (!dots || dots.length === 0) {
    return null;
  }

  const values = dots.map((dot) => dot.value);
  const resolvedMax = max ?? Math.max(...values, 1);
  const range = resolvedMax - min || 1;

  const padX = 6;
  const axisY = height - 14;
  const innerW = width - padX * 2;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      style={{ display: "block", overflow: "visible" }}
    >
      <line
        x1={padX}
        x2={width - padX}
        y1={axisY}
        y2={axisY}
        stroke="var(--cm-line-dark-strong)"
        strokeWidth={1}
      />
      {dots.map((dot, index) => {
        const x = padX + ((dot.value - min) / range) * innerW;
        const y = axisY - 4 - (index % 3) * 5;
        return (
          <circle
            key={`${dot.value}-${index}`}
            cx={x}
            cy={y}
            r={3.5}
            fill={DOT_TONE_FILL[dot.tone ?? "accent"]}
            opacity={0.82}
          >
            {dot.label ? <title>{dot.label}</title> : null}
          </circle>
        );
      })}
      {ticks?.map((tick) => {
        const x = padX + ((tick.value - min) / range) * innerW;
        return (
          <g key={tick.value}>
            <line
              x1={x}
              x2={x}
              y1={axisY}
              y2={axisY + 3}
              stroke="var(--cm-line-dark-strong)"
              strokeWidth={1}
            />
            <text
              x={x}
              y={height - 2}
              textAnchor="middle"
              fontSize={9}
              fontFamily="var(--cm-font-mono)"
              fill="var(--cm-platinum-soft)"
            >
              {tick.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ============================================================
 * StatusRibbon — compact timeline of success/fail/running cells.
 * Render e.g. the last 24h of automation runs as a ribbon.
 * ============================================================ */
export type StatusRibbonStatus = "ok" | "warn" | "risk" | "info" | "muted";

export interface StatusRibbonCell {
  status: StatusRibbonStatus;
  /** Accessible description (run id, timestamp). */
  label?: string;
}

export interface StatusRibbonProps {
  cells: StatusRibbonCell[];
  /** Cell width in px. Defaults to 10. */
  cellWidth?: number;
  /** Height in px. Defaults to 22. */
  height?: number;
  ariaLabel?: string;
  className?: string;
}

const RIBBON_FILL: Record<StatusRibbonStatus, string> = {
  ok: "var(--cm-ok-500)",
  warn: "var(--cm-warn-500)",
  risk: "var(--cm-risk-500)",
  info: "var(--cm-metal-400)",
  muted: "rgba(255, 255, 255, 0.18)",
};

export function StatusRibbon({
  cells,
  cellWidth = 10,
  height = 22,
  ariaLabel,
  className,
}: StatusRibbonProps) {
  if (!cells || cells.length === 0) {
    return null;
  }

  const style: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${cells.length}, ${cellWidth}px)`,
    gap: 2,
  };

  return (
    <div
      className={className}
      role="img"
      aria-label={ariaLabel}
      style={style}
    >
      {cells.map((cell, index) => (
        <span
          key={index}
          title={cell.label ?? cell.status}
          style={{
            display: "block",
            height,
            borderRadius: 2,
            background: RIBBON_FILL[cell.status],
            opacity: cell.status === "muted" ? 0.4 : 1,
          }}
        />
      ))}
    </div>
  );
}

/* ============================================================
 * MetricWithSpark — KPI label + value + inline sparkline bundle.
 * Use in Dashboard's top strip; the sparkline belongs on the same
 * row as the metric so the eye reads trend and number together.
 * ============================================================ */
export interface MetricWithSparkProps {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  trend?: number[];
  trendLabel?: string;
  delta?: ReactNode;
  deltaTone?: "up" | "down" | "warn" | "neutral";
}

export function MetricWithSpark({
  label,
  value,
  detail,
  trend,
  trendLabel,
  delta,
  deltaTone = "neutral",
}: MetricWithSparkProps) {
  return (
    <article className="cm-metric-spark">
      <div className="cm-metric-spark__head">
        <p className="cm-metric-spark__label">{label}</p>
        {delta ? (
          <span
            className="cm-metric-spark__delta"
            data-tone={deltaTone === "neutral" ? undefined : deltaTone}
          >
            {delta}
          </span>
        ) : null}
      </div>
      <div className="cm-metric-spark__body">
        <span className="cm-metric-spark__value">{value}</span>
        {trend && trend.length ? (
          <Sparkline
            values={trend}
            ariaLabel={trendLabel}
            width={96}
            height={28}
          />
        ) : null}
      </div>
      {detail ? <p className="cm-metric-spark__detail">{detail}</p> : null}
    </article>
  );
}
