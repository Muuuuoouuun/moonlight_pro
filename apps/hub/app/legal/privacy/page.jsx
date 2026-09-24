import linkStyles from "../policy-link.module.css";

const updatedAt = "2026-09-24";

export const metadata = {
  title: "Privacy Policy | Moonlight",
  description: "Privacy policy for Moonlight social and YouTube connections.",
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
          Moonlight is a private operator tool for preparing content and connecting
          selected YouTube, Instagram, and Threads accounts. Publishing is currently
          completed on each platform and recorded manually in Moonlight.
        </p>
        {[
          ["Data we collect", "Connected account identifiers and names, YouTube channel ID and name, OAuth access and refresh tokens, granted scopes, profile metadata, and connection or sync logs needed to operate the integration."],
          ["How we use data", "Data is used to authenticate an authorized operator's connection, verify the selected YouTube channel with read-only access, and record connection status. YouTube upload permission is requested for future operator-initiated publishing; Moonlight does not currently upload videos or publish social posts through an API."],
          ["Storage", "Integration records are stored in the configured Supabase workspace. OAuth secrets are not exposed in the browser."],
          ["Sharing", "Moonlight does not sell connected account data. OAuth and channel verification requests are sent to the connected provider when an authorized operator connects an account."],
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
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>Google and YouTube</h2>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 1.65 }}>
            Moonlight uses YouTube API Services to identify the channel selected during
            authorization. Google also processes information under its{" "}
            <a className={linkStyles.link} href="https://policies.google.com/privacy">
              Privacy Policy
            </a>.
          </p>
        </section>
      </article>
    </main>
  );
}
