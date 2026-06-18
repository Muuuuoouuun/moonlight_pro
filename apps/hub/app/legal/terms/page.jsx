const updatedAt = "2026-06-02";

export const metadata = {
  title: "Terms of Service | Moonlight",
  description: "Terms for Moonlight social integrations.",
};

export default function TermsPage() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--bg)",
      color: "var(--text)",
      padding: "48px 20px",
    }}>
      <article style={{
        width: "min(760px, 100%)",
        margin: "0 auto",
        display: "grid",
        gap: 18,
      }}>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>Updated {updatedAt}</div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>Terms of Service</h1>
        <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.7 }}>
          Moonlight is a private operating surface for preparing, approving, and
          recording content and automation workflows for connected brands.
        </p>
        {[
          ["Authorized use", "Only authorized operators may connect a brand account or trigger workflows on behalf of that brand."],
          ["Provider rules", "Use of connected social accounts must follow the applicable Meta, Instagram, and Threads platform terms and policies."],
          ["Content responsibility", "The operator remains responsible for drafts, approvals, scheduling decisions, and any content published through a connected account."],
          ["Availability", "Integrations may be interrupted by provider outages, token expiration, app review changes, or permission changes."],
          ["Security", "Operators should protect app secrets and rotate credentials if a secret is exposed."],
          ["Contact", "For service questions, contact junhyuk.mun@classin.com."],
        ].map(([title, body]) => (
          <section key={title} style={{
            borderTop: "1px solid rgba(255,255,255,0.07)",
            paddingTop: 16,
          }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>{title}</h2>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 1.65 }}>{body}</p>
          </section>
        ))}
      </article>
    </main>
  );
}
