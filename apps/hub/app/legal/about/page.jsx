import styles from "./page.module.css";

export const metadata = {
  title: "Moonlight Video Publisher",
  description: "Public information about Moonlight Video Publisher and its account connections.",
};

export default function AboutPage() {
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
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>Moonlight Video Publisher</h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 16, lineHeight: 1.7 }}>
          A private tool for authorized operators to connect brand accounts and prepare
          content for YouTube, Instagram, and Threads.
        </p>
        <section className={styles.section}>
          <h2>What it does today</h2>
          <p>
            Moonlight stores content drafts and manual publishing records. Its YouTube
            connection reads the selected channel ID and name so an operator can confirm
            the intended channel. Social connections identify the selected account.
          </p>
        </section>
        <section className={styles.section}>
          <h2>Publishing status</h2>
          <p>
            The app requests YouTube upload permission for future publishing initiated
            by an authorized operator. Video upload and automatic social publishing are
            not active in Moonlight today. Operators publish in each platform and record
            the result in Moonlight.
          </p>
        </section>
        <nav className={styles.links} aria-label="Moonlight policies">
          <a className={styles.link} href="/legal/privacy">Privacy Policy</a>
          <a className={styles.link} href="/legal/terms">Terms of Service</a>
          <a className={styles.link} href="/legal/data-deletion">Data Deletion</a>
        </nav>
      </article>
    </main>
  );
}
