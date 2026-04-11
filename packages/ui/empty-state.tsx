import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  surface?: "dark" | "light";
  className?: string;
}

/**
 * Every list view needs one. See the Quality Bar in DESIGN.md §11 —
 * empty states must explain the next useful action, not apologize.
 */
export function EmptyState({
  title,
  description,
  action,
  surface = "dark",
  className,
}: EmptyStateProps) {
  const classes = ["cm-empty", className].filter(Boolean).join(" ");
  return (
    <div className={classes} data-surface={surface}>
      <h3 className="cm-empty__title">{title}</h3>
      {description ? (
        <p className="cm-empty__description">{description}</p>
      ) : null}
      {action ? <div className="cm-empty__action">{action}</div> : null}
    </div>
  );
}
