import linkStyles from "../policy-link.module.css";

const updatedAt = "2026-09-24";

export const metadata = {
  title: "Terms of Service | Moonlight",
  description: "Terms for Moonlight social and YouTube connections.",
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
          Moonlight is a private operating surface for preparing content, connecting
          authorized brand channels, and recording manual publication. API publishing
          and video upload are not currently available.
        </p>
        {[
          ["Authorized use", "Only authorized operators may connect a brand account or trigger workflows on behalf of that brand."],
          ["Provider rules", "Use of connected accounts must follow the applicable Google, YouTube, Meta, Instagram, and Threads platform terms and policies."],
          ["YouTube permission", "The YouTube connection reads the selected channel ID and name. Upload permission is requested for future operator-initiated publishing and does not mean the app currently uploads videos."],
          ["Content responsibility", "The operator remains responsible for drafts, approvals, and content published directly on each platform."],
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
        <section style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>YouTube Terms</h2>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 1.65 }}>
            By using Moonlight&apos;s YouTube connection, the authorized operator also
            agrees to the{" "}<a className={linkStyles.link} href="https://www.youtube.com/t/terms">
              YouTube Terms of Service
            </a>.
          </p>
        </section>
      </article>
    </main>
  );
}
