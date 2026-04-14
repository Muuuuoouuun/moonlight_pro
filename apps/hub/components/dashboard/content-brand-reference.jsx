import { SectionCard } from "@/components/dashboard/section-card";

export function ContentBrandReference({ reference, compact = false }) {
  const items = [
    {
      label: "Selected scope",
      value: reference.label,
      detail: reference.rule,
    },
    {
      label: "Directory source",
      value: reference.directory,
      detail: "Keep the current brand's directory and naming system attached to every content pass.",
    },
    {
      label: "Format source",
      value: reference.format,
      detail: "Use brand-specific format rules before you lock copy, channel, and asset choices.",
    },
  ];

  return (
    <SectionCard
      kicker={reference.value === "all" ? "Brand system" : "Selected brand"}
      title={reference.title}
      description={reference.description}
    >
      <div className={`brand-reference-grid${compact ? " compact" : ""}`}>
        {items.map((item) => (
          <article className="brand-reference-item" key={`${reference.value}-${item.label}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
      <p className="context-footnote">{reference.status}</p>
    </SectionCard>
  );
}
