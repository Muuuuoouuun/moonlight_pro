import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "../components/language-switcher";

function HeroLineArt() {
  return (
    <svg
      aria-hidden="true"
      className="hero-line-art"
      viewBox="0 0 440 420"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M150 190C145 132 173 110 194 110C225 110 221 154 206 170C192 184 162 178 156 150C149 120 177 88 210 88C244 88 270 118 268 150C266 182 240 203 216 206C184 210 151 190 126 159C102 130 86 116 68 118C47 120 40 142 47 162C58 193 91 218 116 233C150 254 183 277 188 309C192 338 171 356 150 356C116 356 98 320 108 293C120 261 160 246 190 252C226 259 263 285 285 309C315 341 356 343 380 319C403 296 400 252 377 226C348 193 318 170 304 136C292 106 295 66 332 48"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="6"
      />
      <path
        d="M90 125C94 113 107 105 120 107C138 111 145 129 142 144"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="6"
      />
    </svg>
  );
}

/*
 * Static key tables for the repeated card grids.
 *
 * The rendered order and structure is identical across locales, so we
 * only need stable keys to look up translations. Each NAV entry holds
 * the translation key and the in-page anchor.
 */
const NAV_KEYS = [
  ["loop", "#loop"],
  ["desk", "#desk"],
  ["useCases", "#use-cases"],
  ["contact", "#contact"],
] as const;

const PROOF_KEYS = ["trust", "signal", "mobile"] as const;
const PILLAR_KEYS = ["content", "lead", "ops"] as const;
const PILLAR_POINT_KEYS = ["one", "two", "three"] as const;
const WORKFLOW_KEYS = ["one", "two", "three"] as const;
const USE_CASE_KEYS = ["intro", "response", "today"] as const;
const FOOTER_GROUP_KEYS = ["surface", "os", "loop"] as const;
const FOOTER_LINK_KEYS: Record<
  (typeof FOOTER_GROUP_KEYS)[number],
  readonly string[]
> = {
  surface: ["landing", "contentHub", "caseNotes"],
  os: ["dashboard", "leads", "operations"],
  loop: ["automations", "logs", "contentDesk"],
};
const FLOATING_NOTE_ITEM_KEYS = ["draft", "inbound", "followup"] as const;
const SIDEBAR_TODAY_ITEM_KEYS = ["one", "two", "three"] as const;
const KPI_KEYS = ["ops", "leads", "queue"] as const;
const LEAD_QUEUE_KEYS = ["one", "two", "three"] as const;
const AUTOMATION_KEYS = ["publish", "sync", "report"] as const;

export default function WebHomePage() {
  const t = useTranslations();

  return (
    <main className="web-page">
      <header className="topbar">
        <div className="web-shell topbar-inner">
          <a className="brand-lockup" href="#top">
            <span className="brand-mark">CM</span>
            <span className="brand-text">
              <strong>{t("brand.name")}</strong>
              <span>{t("brand.tagline")}</span>
            </span>
          </a>

          <nav className="topnav" aria-label="Primary">
            {NAV_KEYS.map(([key, href]) => (
              <a key={href} href={href}>
                {t(`nav.${key}`)}
              </a>
            ))}
          </nav>

          <div style={{ display: "inline-flex", alignItems: "center" }}>
            <LanguageSwitcher />
            <a className="topbar-cta" href="mailto:hello@com-moon.local">
              {t("nav.cta")}
            </a>
          </div>
        </div>
      </header>

      <section className="hero-section web-shell" id="top">
        <div className="hero-copy-panel">
          <p className="eyebrow">{t("hero.eyebrow")}</p>
          <div className="chip-row" aria-label="Key themes">
            <span>{t("hero.chips.content")}</span>
            <span>{t("hero.chips.lead")}</span>
            <span>{t("hero.chips.ops")}</span>
          </div>
          <h1 className="display-title">
            {t("hero.titleLine1")}
            <br />
            {t("hero.titleLine2")}
            <br />
            {t("hero.titleLine3")}
          </h1>
          <p className="hero-copy">{t("hero.copy")}</p>

          <div className="hero-actions">
            <a href="#desk" className="primary-link">
              {t("hero.primaryAction")}
            </a>
            <a href="#contact" className="secondary-link">
              {t("hero.secondaryAction")}
            </a>
          </div>

          <section className="proof-inline" aria-label="Trust proof">
            {PROOF_KEYS.map((key) => (
              <article key={key} className="proof-card">
                <p>{t(`hero.proof.${key}.kicker`)}</p>
                <strong>{t(`hero.proof.${key}.value`)}</strong>
                <span>{t(`hero.proof.${key}.detail`)}</span>
              </article>
            ))}
          </section>
        </div>

        <div className="hero-visual-panel" aria-hidden="true">
          <div className="hero-orb" />
          <HeroLineArt />

          <article className="floating-note">
            <p className="note-label">{t("hero.floatingNote.label")}</p>
            <h2>{t("hero.floatingNote.title")}</h2>
            <ul>
              {FLOATING_NOTE_ITEM_KEYS.map((key) => (
                <li key={key}>{t(`hero.floatingNote.items.${key}`)}</li>
              ))}
            </ul>
          </article>

          <article className="floating-window">
            <p className="window-label">{t("hero.floatingWindow.label")}</p>
            <strong>{t("hero.floatingWindow.headline")}</strong>
            <span>{t("hero.floatingWindow.body")}</span>
          </article>
        </div>
      </section>

      <section className="signal-band" id="loop">
        <div className="web-shell">
          <div className="section-heading">
            <p className="eyebrow">{t("loop.eyebrow")}</p>
            <h2 className="section-title">{t("loop.title")}</h2>
            <p className="section-copy">{t("loop.copy")}</p>
          </div>

          <div className="pillar-grid">
            {PILLAR_KEYS.map((key) => (
              <article key={key} className="pillar-card">
                <p className="pillar-kicker">Public Layer</p>
                <h3>{t(`loop.pillars.${key}.title`)}</h3>
                <p>{t(`loop.pillars.${key}.body`)}</p>
                <ul>
                  {PILLAR_POINT_KEYS.map((pointKey) => (
                    <li key={pointKey}>
                      {t(`loop.pillars.${key}.points.${pointKey}`)}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="story-section web-shell">
        <div className="story-copy">
          <p className="eyebrow">{t("story.eyebrow")}</p>
          <h2 className="section-title">{t("story.title")}</h2>
          <p className="section-copy">{t("story.copy")}</p>
        </div>

        <div className="workflow-list">
          {WORKFLOW_KEYS.map((key, index) => (
            <article key={key} className="workflow-card">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{t(`story.workflows.${key}.title`)}</h3>
                <p>{t(`story.workflows.${key}.body`)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="workspace-section" id="desk">
        <div className="web-shell workspace-inner">
          <div className="section-heading section-heading-center">
            <p className="eyebrow">{t("workspace.eyebrow")}</p>
            <h2 className="section-title">{t("workspace.title")}</h2>
            <p className="section-copy">{t("workspace.copy")}</p>
          </div>

          <div className="workspace-frame">
            <aside className="workspace-sidebar">
              <div className="workspace-card workspace-card-strong">
                <p className="card-label">
                  {t("workspace.sidebar.today.label")}
                </p>
                <strong>{t("workspace.sidebar.today.title")}</strong>
                <ul>
                  {SIDEBAR_TODAY_ITEM_KEYS.map((key) => (
                    <li key={key}>
                      {t(`workspace.sidebar.today.items.${key}`)}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="workspace-card">
                <p className="card-label">
                  {t("workspace.sidebar.signal.label")}
                </p>
                <strong>{t("workspace.sidebar.signal.title")}</strong>
                <span>{t("workspace.sidebar.signal.body")}</span>
              </div>
            </aside>

            <div className="workspace-main">
              <div className="workspace-toolbar">
                <span>{t("workspace.toolbar.title")}</span>
                <div>
                  <span>{t("workspace.toolbar.tabs.content")}</span>
                  <span>{t("workspace.toolbar.tabs.leads")}</span>
                  <span>{t("workspace.toolbar.tabs.ops")}</span>
                </div>
              </div>

              <div className="mini-kpi-grid">
                {KPI_KEYS.map((key) => (
                  <article key={key}>
                    <p>{t(`workspace.kpi.${key}.label`)}</p>
                    <strong>{t(`workspace.kpi.${key}.value`)}</strong>
                    <span>{t(`workspace.kpi.${key}.sub`)}</span>
                  </article>
                ))}
              </div>

              <div className="desk-grid">
                <article className="desk-panel">
                  <p className="card-label">
                    {t("workspace.desk.leadQueue.label")}
                  </p>
                  <ul className="compact-list">
                    {LEAD_QUEUE_KEYS.map((key) => (
                      <li key={key}>
                        <strong>
                          {t(`workspace.desk.leadQueue.items.${key}.title`)}
                        </strong>
                        <span>
                          {t(`workspace.desk.leadQueue.items.${key}.meta`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="desk-panel desk-panel-soft">
                  <p className="card-label">
                    {t("workspace.desk.automation.label")}
                  </p>
                  <div className="health-stack">
                    {AUTOMATION_KEYS.map((key) => (
                      <div key={key}>
                        <strong>
                          {t(`workspace.desk.automation.items.${key}.title`)}
                        </strong>
                        <span>
                          {t(`workspace.desk.automation.items.${key}.status`)}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="use-case-section web-shell" id="use-cases">
        <div className="section-heading">
          <p className="eyebrow">{t("useCases.eyebrow")}</p>
          <h2 className="section-title">{t("useCases.title")}</h2>
        </div>

        <div className="use-case-grid">
          {USE_CASE_KEYS.map((key) => (
            <article key={key} className="use-case-card">
              <h3>{t(`useCases.items.${key}.title`)}</h3>
              <p>{t(`useCases.items.${key}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-section web-shell" id="contact">
        <div className="cta-bar">
          <div>
            <p className="eyebrow">{t("ctaBand.eyebrow")}</p>
            <h2>{t("ctaBand.title")}</h2>
            <p className="cta-note">{t("ctaBand.body")}</p>
          </div>
          <a
            href="mailto:hello@com-moon.local?subject=Com_Moon%20inquiry"
            className="primary-link"
          >
            {t("ctaBand.action")}
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <div className="web-shell footer-inner">
          <div className="footer-brand">
            <a className="brand-lockup brand-lockup-invert" href="#top">
              <span className="brand-mark">CM</span>
              <span className="brand-text">
                <strong>{t("brand.name")}</strong>
                <span>{t("brand.footerTagline")}</span>
              </span>
            </a>
            <p>{t("footer.description")}</p>
          </div>

          <div className="footer-links">
            {FOOTER_GROUP_KEYS.map((groupKey) => (
              <div key={groupKey}>
                <p>{t(`footer.groups.${groupKey}.title`)}</p>
                <ul>
                  {FOOTER_LINK_KEYS[groupKey].map((linkKey) => (
                    <li key={linkKey}>
                      {t(`footer.groups.${groupKey}.links.${linkKey}`)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
