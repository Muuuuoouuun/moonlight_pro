const updatedAt = "2026-06-02";

export const metadata = {
  title: "Privacy Policy | Moonlight",
  description: "Privacy policy for Moonlight social integrations.",
};

export default function PrivacyPolicyPage() {
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
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>Privacy Policy</h1>
        <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.7 }}>
          Moonlight connects selected social accounts, including Classmooni / moon.classin,
          so the operator can prepare, schedule, and review content workflows.
        </p>
        {[
          ["Data we collect", "Account identifiers, usernames, OAuth tokens, profile metadata, publishing status, and sync logs needed to operate the connected integration."],
          ["How we use data", "Data is used only to authenticate the connected account, run requested publishing or analytics workflows, and record operational status in the Moonlight ledger."],
          ["Storage", "Integration records are stored in the configured Supabase workspace. OAuth secrets are not exposed in the browser."],
          ["Sharing", "Moonlight does not sell connected account data. Data is shared with the connected provider only when the operator initiates an approved workflow."],
          ["Retention", "Connection data is retained while the integration is active and may be deleted when the operator disconnects the account or requests deletion."],
          ["Contact", "For privacy requests, contact junhyuk.mun@classin.com."],
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
