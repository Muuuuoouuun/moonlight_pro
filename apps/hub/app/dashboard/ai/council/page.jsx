import { AiCouncilWorkspace } from "@/components/dashboard/ai-council-workspace";
import { getAiConsolePageData } from "@/lib/server-data";

function resolveFirst(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AiCouncilPage({ searchParams }) {
  const params = (await searchParams) ?? {};
  const { councilSessions } = await getAiConsolePageData();
  const initialDraft = resolveFirst(params?.topic) || resolveFirst(params?.context)
    ? {
        topic: resolveFirst(params?.topic) || "",
        context: resolveFirst(params?.context) || "",
        members: resolveFirst(params?.members) || "claude,codex",
        source: resolveFirst(params?.source) || "",
      }
    : null;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">AI · Council</p>
        <h1>에이전트가 서로 검토하고 결정하는 자리</h1>
        <p>
          하나의 주제에 Claude와 Codex를 같이 앉히고, 제안 → 보완 → 결정까지 턴을 남기는 공간입니다. 혼자 답을
          받는 것보다 두 모델이 부딪힐 때 더 좋은 결론이 나옵니다.
        </p>
      </section>

      <AiCouncilWorkspace initialSessions={councilSessions} initialDraft={initialDraft} />
    </div>
  );
}
