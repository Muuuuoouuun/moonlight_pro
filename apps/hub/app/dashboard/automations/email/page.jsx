import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { EmailComposer } from "@/components/forms/email-composer";
import { getEmailAutomationPageData } from "@/lib/server-data";

const channelStatusTone = {
  primary: "green",
  ready: "blue",
  planned: "warning",
};

const sendStatusTone = {
  delivered: "green",
  scheduled: "blue",
  failed: "danger",
  draft: "muted",
  blocked: "warning",
};

const queueStatusLabel = {
  scheduled: "scheduled",
  draft: "draft",
  blocked: "waiting",
};

function channelDisplayName(channels, channelId) {
  return channels.find((item) => item.id === channelId)?.name ?? channelId;
}

function resolveSegmentId(segments, value) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  return segments.find((item) => item.id === normalized)?.id ?? segments[0]?.id ?? "all";
}

function resolveEmailMessage(value) {
  if (Array.isArray(value)) {
    return resolveEmailMessage(value[0]);
  }

  if (value === "connected") {
    return {
      tone: "green",
      title: "Gmail connected",
      detail: "Google OAuth connection is complete. Personal-name sends can now route through Gmail.",
    };
  }

  if (value === "oauth-denied" || value === "connect-failed" || value === "missing-google-config") {
    return {
      tone: "danger",
      title: "Gmail connection needs attention",
      detail:
        value === "missing-google-config"
          ? "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing in the hub env."
          : "Gmail OAuth did not complete cleanly. Retry the connect flow and check the integration lane.",
    };
  }

  if (value === "missing-code") {
    return {
      tone: "warning",
      title: "Missing Gmail OAuth callback code",
      detail: "Google returned without an authorization code. Retry the Gmail connect flow.",
    };
  }

  return null;
}

export default async function EmailAutomationPage({ searchParams }) {
  const {
    defaultWorkspaceId,
    emailSummary,
    emailChannels,
    emailTemplates,
    emailQueue,
    emailSends,
    emailRules,
    emailSegments,
    emailVariables,
    emailBlocks,
  } = await getEmailAutomationPageData();

  const emailMessage = resolveEmailMessage(searchParams?.gmail);
  const selectedSegmentId = resolveSegmentId(emailSegments, searchParams?.segment);
  const selectedSegment =
    emailSegments.find((item) => item.id === selectedSegmentId) ?? emailSegments[0];

  const filteredTemplates =
    selectedSegment.audience === "any"
      ? emailTemplates
      : emailTemplates.filter((item) => item.audience === selectedSegment.audience);

  const filteredQueue =
    selectedSegment.audience === "any"
      ? emailQueue
      : emailQueue.filter((item) => {
          const template = emailTemplates.find((tpl) => tpl.name === item.template);
          return template?.audience === selectedSegment.audience;
        });

  return (
    <>
      <section className="summary-grid" aria-label="Email automation summary metrics">
        {emailSummary.map((metric) => (
          <SummaryCard key={metric.title} {...metric} />
        ))}
      </section>

      {emailMessage ? (
        <div className="status-note" data-tone={emailMessage.tone}>
          <strong>{emailMessage.title}</strong>
          <p>{emailMessage.detail}</p>
        </div>
      ) : null}

      <div className="stack">
        <SectionCard
          kicker="Audience"
          title="오늘 누구에게 보낼까"
          description="세그먼트를 클릭하면 컴포저, 템플릿, 큐가 즉시 그 대상으로 좁혀집니다."
          action={
            <div className="inline-legend">
              {emailSegments.map((segment) => (
                <Link
                  key={segment.id}
                  className="legend-chip"
                  data-tone={selectedSegmentId === segment.id ? segment.tone : "muted"}
                  href={`/dashboard/automations/email?segment=${segment.id}`}
                >
                  {segment.label} · {segment.count}
                </Link>
              ))}
            </div>
          }
        >
          <p className="check-detail">{selectedSegment.note}</p>
        </SectionCard>

        <SectionCard
          kicker="Composer"
          title="메일 한 통 빠르게 조립하기"
          description="템플릿을 고르고 변수 칩과 블록을 클릭해 본문을 채우세요. 미리보기는 세그먼트 샘플로 즉시 치환됩니다."
        >
          <EmailComposer
            segments={emailSegments}
            initialSegmentId={selectedSegmentId}
            templates={emailTemplates}
            variables={emailVariables}
            blocks={emailBlocks}
            channels={emailChannels}
            defaultWorkspaceId={defaultWorkspaceId}
          />
        </SectionCard>

        <SectionCard
          kicker="Routing"
          title="Channel posture"
          description="각 채널은 서로 다른 종류의 메일을 책임지도록 분리되어 있습니다."
          action={
            <Link className="button button-secondary" href="/dashboard/automations/integrations">
              Connect providers
            </Link>
          }
        >
          <div className="project-grid">
            {emailChannels.map((channel) => (
              <article className="project-card" key={channel.id}>
                <div className="project-head">
                  <div>
                    <h3>{channel.name}</h3>
                    <p>{channel.mode}</p>
                  </div>
                  <span
                    className="legend-chip"
                    data-tone={channelStatusTone[channel.status] ?? "muted"}
                  >
                    {channel.status}
                  </span>
                </div>
                <p className="check-detail">{channel.detail}</p>
                <p className="check-detail">
                  <strong>Env</strong> · <code>{channel.envHint}</code>
                </p>
                <p className="check-detail">
                  <strong>Next</strong> · {channel.nextAction}
                </p>
                {channel.connectHref ? (
                  <div className="hero-actions">
                    <Link className="button button-secondary" href={channel.connectHref}>
                      {channel.status === "ready" ? "Reconnect Gmail" : "Connect Gmail"}
                    </Link>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          kicker="Library"
          title={`Template catalog · ${selectedSegment.label}`}
          description={
            selectedSegment.audience === "any"
              ? "모든 템플릿이 표시됩니다. 세그먼트를 좁히면 해당 audience 의 템플릿만 남습니다."
              : `${selectedSegment.label} 세그먼트에 매칭되는 템플릿입니다.`
          }
        >
          {filteredTemplates.length === 0 ? (
            <p className="check-detail">
              이 세그먼트에 맞는 템플릿이 아직 없습니다. 컴포저에서 새 초안을 만들어 저장하세요.
            </p>
          ) : (
            <div className="template-grid">
              {filteredTemplates.map((template) => (
                <div className="template-row" key={template.id}>
                  <div>
                    <strong>{template.name}</strong>
                    <p>{template.purpose}</p>
                    <p className="check-detail">
                      <strong>Subject</strong> · {template.subject}
                    </p>
                    <p className="check-detail">
                      <strong>CTA</strong> · {template.cta} · <strong>Audience</strong> ·{" "}
                      {template.audience}
                    </p>
                  </div>
                  <div className="inline-legend">
                    <span className="endpoint-pill">
                      <span>via</span>
                      <code>{channelDisplayName(emailChannels, template.channel)}</code>
                    </span>
                    <span
                      className="legend-chip"
                      data-tone={template.status === "ready" ? "green" : "warning"}
                    >
                      {template.status}
                    </span>
                    <span className="muted tiny">last used {template.lastUsed}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="split-grid">
          <SectionCard
            kicker="Queue"
            title="Sends waiting to move"
            description="현재 세그먼트에 묶인 발송 대기 항목입니다."
          >
            {filteredQueue.length === 0 ? (
              <p className="check-detail">대기 중인 발송이 없습니다.</p>
            ) : (
              <div className="timeline">
                {filteredQueue.map((item) => (
                  <div className="timeline-item" key={item.id}>
                    <div className="inline-legend">
                      <span
                        className="legend-chip"
                        data-tone={sendStatusTone[item.status] ?? "muted"}
                      >
                        {queueStatusLabel[item.status] ?? item.status}
                      </span>
                      <span className="muted tiny">{item.scheduledFor}</span>
                    </div>
                    <strong>{item.template}</strong>
                    <p>
                      To <strong>{item.recipient}</strong> · via{" "}
                      {channelDisplayName(emailChannels, item.channel)}
                    </p>
                    <p className="check-detail">{item.note}</p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            kicker="Output"
            title="Recent sends"
            description="발송 결과는 항상 보이게 두어야 실패가 조용히 묻히지 않습니다."
            action={
              <Link className="button button-ghost" href="/dashboard/evolution/logs">
                Inspect failures
              </Link>
            }
          >
            <div className="timeline">
              {emailSends.map((item) => (
                <div className="timeline-item" key={item.id}>
                  <div className="inline-legend">
                    <span
                      className="legend-chip"
                      data-tone={sendStatusTone[item.status] ?? "muted"}
                    >
                      {item.status}
                    </span>
                    <span className="muted tiny">{item.time}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>
                    via <strong>{channelDisplayName(emailChannels, item.channel)}</strong>
                  </p>
                  <p className="check-detail">{item.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          kicker="Rules"
          title="Operator guardrails"
          description="A few simple rules keep email from drifting into spam or surprise sends."
        >
          <ul className="note-list">
            {emailRules.map((rule) => (
              <li className="note-row" key={rule.title}>
                <div>
                  <strong>{rule.title}</strong>
                  <p>{rule.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
