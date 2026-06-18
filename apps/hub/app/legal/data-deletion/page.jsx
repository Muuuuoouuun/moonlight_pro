const updatedAt = "2026-06-02";

export const metadata = {
  title: "Data Deletion | Moonlight",
  description: "Data deletion instructions for Moonlight social integrations.",
};

export default function DataDeletionPage() {
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
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>Data Deletion</h1>
        <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.7 }}>
          To delete data associated with a connected Moonlight social integration,
          send a request from the account owner or authorized operator.
        </p>
        <section style={{
          borderTop: "1px solid rgba(255,255,255,0.07)",
          paddingTop: 16,
        }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>Request channel</h2>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 1.65 }}>
            Email junhyuk.mun@classin.com with the brand handle, connected provider,
            and deletion request. Moonlight will remove stored integration tokens,
            account metadata, and related sync logs where legally and operationally possible.
          </p>
        </section>
        <section style={{
          borderTop: "1px solid rgba(255,255,255,0.07)",
          paddingTop: 16,
        }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>Expected handling</h2>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 1.65 }}>
            Requests are reviewed manually. Deletion removes Moonlight-held
            integration data and does not delete content or account records held by Meta.
          </p>
        </section>
      </article>
    </main>
  );
}
