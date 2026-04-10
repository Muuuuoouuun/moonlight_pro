const navItems = [
  { label: "Loop", href: "#loop" },
  { label: "Desk", href: "#desk" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Contact", href: "#contact" },
];

const proofItems = [
  {
    value: "Content -> Lead",
    label: "콘텐츠가 신뢰를 만들고 바로 문의와 후속 액션으로 이어집니다.",
  },
  {
    value: "Lead -> Ops",
    label: "퍼블릭에서 들어온 신호가 허브의 세일즈와 운영 판단으로 돌아옵니다.",
  },
  {
    value: "Mobile-first",
    label: "밖에서도 숫자 확인, 메모 기록, 다음 액션 결정이 가능한 운영 감각을 지향합니다.",
  },
];

const pillars = [
  {
    title: "Content Engine",
    body: "아이디어를 카드뉴스, 블로그, 인사이트 글로 이어 붙여 퍼블릭 신뢰를 쌓습니다.",
    points: ["카드뉴스 발행", "인사이트 아카이브", "콘텐츠 시리즈 운영"],
  },
  {
    title: "Lead Capture",
    body: "반응은 흘려보내지 않고, 문의와 리드로 구조화해 다음 액션으로 넘깁니다.",
    points: ["문의 전환", "소스 추적", "후속 액션 설계"],
  },
  {
    title: "Operating Signal",
    body: "퍼블릭 성과는 다시 허브 OS로 돌아가 무엇을 밀어야 하는지 결정하는 신호가 됩니다.",
    points: ["우선순위 재정렬", "운영 리듬 조정", "자동화 트리거"],
  },
];

const workflows = [
  {
    label: "01",
    title: "밖에서 신뢰를 만든다",
    body: "공개 콘텐츠는 단순 홍보물이 아니라, Com_Moon의 판단력과 방식이 드러나는 샘플이어야 합니다.",
  },
  {
    label: "02",
    title: "반응을 리드로 붙잡는다",
    body: "좋아요나 조회수로 끝내지 않고, 누가 관심을 보였는지와 무엇을 다음에 해야 하는지를 남깁니다.",
  },
  {
    label: "03",
    title: "운영 판단으로 되돌린다",
    body: "콘텐츠 성과와 문의 흐름은 내부 대시보드에서 우선순위, 자동화, 실행 상태로 이어집니다.",
  },
];

const useCases = [
  {
    title: "서비스 소개를 운영 언어로 바꾸기",
    body: "예쁜 소개 페이지가 아니라, 실제 일하는 방식과 결과 흐름을 보이게 만드는 퍼블릭 구조.",
  },
  {
    title: "콘텐츠 반응을 놓치지 않기",
    body: "카드뉴스나 글에서 들어온 반응을 리드와 후속 액션으로 붙잡아 세일즈 흐름과 연결.",
  },
  {
    title: "오늘 뭘 밀어야 하는지 바로 보기",
    body: "허브에 들어가면 운영 건, 리드, 콘텐츠, 자동화 상태가 한 화면에서 우선순위로 보이는 설계.",
  },
];

const footerGroups = [
  {
    title: "Surface",
    links: ["Public landing", "Content hub", "Case notes"],
  },
  {
    title: "OS",
    links: ["Dashboard", "Leads", "Operations"],
  },
  {
    title: "Loop",
    links: ["Automations", "Logs", "Content desk"],
  },
];

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

export default function WebHomePage() {
  return (
    <main className="web-page">
      <header className="topbar">
        <div className="web-shell topbar-inner">
          <a className="brand-lockup" href="#top">
            <span className="brand-mark">CM</span>
            <span className="brand-text">
              <strong>Com_Moon</strong>
              <span>Public Surface</span>
            </span>
          </a>

          <nav className="topnav" aria-label="Primary">
            {navItems.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <a className="topbar-cta" href="mailto:hello@com-moon.local">
            협업 문의
          </a>
        </div>
      </header>

      <section className="hero-section web-shell" id="top">
        <div className="hero-copy-panel">
          <p className="eyebrow">Com_Moon Public</p>
          <div className="chip-row" aria-label="Key themes">
            <span>Content</span>
            <span>Lead</span>
            <span>Ops</span>
          </div>
          <h1 className="display-title">
            콘텐츠, 리드, 운영이
            <br />
            같은 흐름으로 도는
            <br />
            조용한 성장 데스크
          </h1>
          <p className="hero-copy">
            Com_Moon은 바깥의 신뢰와 안쪽의 판단이 따로 놀지 않게 만듭니다. 퍼블릭
            콘텐츠로 관심을 만들고, 반응을 리드로 구조화하고, 그 결과를 다시 운영
            우선순위와 자동화 흐름으로 되돌립니다.
          </p>

          <div className="hero-actions">
            <a href="#desk" className="primary-link">
              데스크 흐름 보기
            </a>
            <a href="#contact" className="secondary-link">
              문의 동선 보기
            </a>
          </div>

          <dl className="proof-inline">
            {proofItems.map((item) => (
              <div key={item.value}>
                <dt>{item.value}</dt>
                <dd>{item.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="hero-visual-panel" aria-hidden="true">
          <div className="hero-orb" />
          <HeroLineArt />

          <article className="floating-note">
            <p className="note-label">This week</p>
            <h2>오늘의 신호</h2>
            <ul>
              <li>카드뉴스 초안 3건</li>
              <li>문의 유입 5건</li>
              <li>팔로업 우선 2건</li>
            </ul>
          </article>

          <article className="floating-window">
            <p className="window-label">Operator note</p>
            <strong>퍼블릭 반응이 좋았던 주제부터 다시 밀기</strong>
            <span>이번 주 콘텐츠 배포, 리드 후속, 제안서 우선순위를 같은 판 위에서 봅니다.</span>
          </article>
        </div>
      </section>

      <section className="signal-band" id="loop">
        <div className="web-shell">
          <div className="section-heading">
            <p className="eyebrow">The Loop</p>
            <h2 className="section-title">밖에서 들어온 신호가 안쪽 운영을 바꿉니다</h2>
            <p className="section-copy">
              퍼블릭은 브로셔가 아니라 센서입니다. 무엇에 사람들이 반응했고, 어떤 문의가
              생겼고, 무엇을 다음에 밀어야 하는지가 다시 허브 OS의 판단으로 이어져야
              합니다.
            </p>
          </div>

          <div className="pillar-grid">
            {pillars.map((pillar) => (
              <article key={pillar.title} className="pillar-card">
                <p className="pillar-kicker">Public Layer</p>
                <h3>{pillar.title}</h3>
                <p>{pillar.body}</p>
                <ul>
                  {pillar.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="story-section web-shell">
        <div className="story-copy">
          <p className="eyebrow">Why This Shape</p>
          <h2 className="section-title">예쁜 랜딩보다, 일하는 방식이 보이는 랜딩</h2>
          <p className="section-copy">
            Com_Moon의 퍼블릭 화면은 "우리가 뭘 합니다"에서 멈추면 안 됩니다. 콘텐츠가
            어떤 리듬으로 생산되고, 반응을 어떻게 붙잡고, 어떤 운영 판단으로
            되돌아가는지가 화면 구조 자체에서 느껴져야 합니다.
          </p>
        </div>

        <div className="workflow-list">
          {workflows.map((workflow) => (
            <article key={workflow.label} className="workflow-card">
              <span>{workflow.label}</span>
              <div>
                <h3>{workflow.title}</h3>
                <p>{workflow.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="workspace-section" id="desk">
        <div className="web-shell workspace-inner">
          <div className="section-heading section-heading-center">
            <p className="eyebrow">Preview The Desk</p>
            <h2 className="section-title">퍼블릭에서 허브로 이어지는 운영 프리뷰</h2>
            <p className="section-copy">
              같은 브랜드 안에서 바깥은 여백 있게, 안쪽은 더 조밀하게. 한 번에 전환되는
              느낌이 아니라 같은 재질의 다른 압력으로 보여야 합니다.
            </p>
          </div>

          <div className="workspace-frame">
            <aside className="workspace-sidebar">
              <div className="workspace-card workspace-card-strong">
                <p className="card-label">Today</p>
                <strong>지금 확인할 것</strong>
                <ul>
                  <li>유입 리드 2건 후속</li>
                  <li>카드뉴스 발행 승인</li>
                  <li>자동화 실패 로그 점검</li>
                </ul>
              </div>

              <div className="workspace-card">
                <p className="card-label">Signal</p>
                <strong>이번 주 반응이 높았던 주제</strong>
                <span>브랜딩 운영 구조화 / 콘텐츠 자동화 / 실무형 세일즈 흐름</span>
              </div>
            </aside>

            <div className="workspace-main">
              <div className="workspace-toolbar">
                <span>Dashboard</span>
                <div>
                  <span>Content</span>
                  <span>Leads</span>
                  <span>Ops</span>
                </div>
              </div>

              <div className="mini-kpi-grid">
                <article>
                  <p>운영 건</p>
                  <strong>12</strong>
                  <span>이번 주 진행 중</span>
                </article>
                <article>
                  <p>신규 리드</p>
                  <strong>05</strong>
                  <span>오늘 유입 기준</span>
                </article>
                <article>
                  <p>발행 대기</p>
                  <strong>03</strong>
                  <span>승인만 남음</span>
                </article>
              </div>

              <div className="desk-grid">
                <article className="desk-panel">
                  <p className="card-label">Lead Queue</p>
                  <ul className="compact-list">
                    <li>
                      <strong>브랜딩 제안 문의</strong>
                      <span>오늘 09:20 · 콘텐츠 유입</span>
                    </li>
                    <li>
                      <strong>운영 자동화 상담</strong>
                      <span>어제 18:40 · 이메일 응답 대기</span>
                    </li>
                    <li>
                      <strong>카드뉴스 제작 요청</strong>
                      <span>어제 14:10 · 미팅 일정 조율</span>
                    </li>
                  </ul>
                </article>

                <article className="desk-panel desk-panel-soft">
                  <p className="card-label">Automation Health</p>
                  <div className="health-stack">
                    <div>
                      <strong>09:00 Publish Flow</strong>
                      <span>Success</span>
                    </div>
                    <div>
                      <strong>11:30 Lead Sync</strong>
                      <span>Retry needed</span>
                    </div>
                    <div>
                      <strong>14:00 Report Draft</strong>
                      <span>Queued</span>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="use-case-section web-shell" id="use-cases">
        <div className="section-heading">
          <p className="eyebrow">Use Cases</p>
          <h2 className="section-title">Com_Moon이 잘해야 하는 장면들</h2>
        </div>

        <div className="use-case-grid">
          {useCases.map((item) => (
            <article key={item.title} className="use-case-card">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-section web-shell" id="contact">
        <div className="cta-bar">
          <div>
            <p className="eyebrow">Start A Conversation</p>
            <h2>지금 붙잡고 싶은 문제는 어떤 건가요?</h2>
          </div>
          <a href="mailto:hello@com-moon.local?subject=Com_Moon%20inquiry" className="primary-link">
            문의 보내기
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <div className="web-shell footer-inner">
          <div className="footer-brand">
            <a className="brand-lockup brand-lockup-invert" href="#top">
              <span className="brand-mark">CM</span>
              <span className="brand-text">
                <strong>Com_Moon</strong>
                <span>Editorial Command Deck</span>
              </span>
            </a>
            <p>
              브랜드, 콘텐츠, 세일즈, 운영을 한 흐름으로 묶는 퍼블릭 표면과 허브 OS.
            </p>
          </div>

          <div className="footer-links">
            {footerGroups.map((group) => (
              <div key={group.title}>
                <p>{group.title}</p>
                <ul>
                  {group.links.map((link) => (
                    <li key={link}>{link}</li>
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
