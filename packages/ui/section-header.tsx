import type { ReactNode } from "react";

export interface SectionHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  surface?: "dark" | "light";
  className?: string;
}

/**
 * The eyebrow + title + description + action pattern that repeats
 * across every operator view. Replaces ad-hoc `.section-card__head`
 * variants — every section should reach for this instead.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  surface = "dark",
  className,
}: SectionHeaderProps) {
  const classes = ["cm-section-header", className].filter(Boolean).join(" ");
  return (
    <header className={classes} data-surface={surface}>
      <div className="cm-section-header__text">
        {eyebrow ? (
          <p className="cm-section-header__eyebrow">{eyebrow}</p>
        ) : null}
        <h2 className="cm-section-header__title">{title}</h2>
        {description ? (
          <p className="cm-section-header__description">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="cm-section-header__action">{action}</div>
      ) : null}
    </header>
  );
}
