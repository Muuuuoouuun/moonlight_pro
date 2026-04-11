import type { ReactNode } from "react";

export type KpiDeltaTone = "up" | "down" | "warn" | "neutral";

export interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: ReactNode;
  deltaTone?: KpiDeltaTone;
  detail?: ReactNode;
  surface?: "dark" | "light";
  className?: string;
}

/**
 * KPI card — monospace tabular value with an optional delta chip and
 * one line of operator context. Use it anywhere you'd otherwise write
 * a "big number + label + footnote" card.
 */
export function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaTone = "neutral",
  detail,
  surface = "dark",
  className,
}: KpiCardProps) {
  const classes = ["cm-kpi", className].filter(Boolean).join(" ");
  return (
    <article className={classes} data-surface={surface}>
      <p className="cm-kpi__label">{label}</p>
      <div className="cm-kpi__value">
        <span>{value}</span>
        {unit ? <span style={{ fontSize: "0.55em", color: "inherit", opacity: 0.7 }}>{unit}</span> : null}
        {delta ? (
          <span
            className="cm-kpi__delta"
            data-tone={deltaTone === "neutral" ? undefined : deltaTone}
          >
            {delta}
          </span>
        ) : null}
      </div>
      {detail ? <p className="cm-kpi__detail">{detail}</p> : null}
    </article>
  );
}
