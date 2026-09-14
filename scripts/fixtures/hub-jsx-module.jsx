import { basename } from "node:path";

export function TestCard({ title }) {
  return (
    <section aria-label={basename("/fixtures/초안")}>
      <strong>{title}</strong>
      <span>검토 & 적용</span>
    </section>
  );
}
