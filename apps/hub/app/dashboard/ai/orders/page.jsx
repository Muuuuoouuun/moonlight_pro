import { AiOrdersWorkspace } from "@/components/dashboard/ai-orders-workspace";
import { getAiConsolePageData } from "@/lib/server-data";

function resolveFirst(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AiOrdersPage({ searchParams }) {
  const params = (await searchParams) ?? {};
  const { openOrders, orderTemplates } = await getAiConsolePageData();
  const initialDraft = resolveFirst(params?.title) || resolveFirst(params?.note)
    ? {
        title: resolveFirst(params?.title) || "",
        target: resolveFirst(params?.target) || "both",
        priority: resolveFirst(params?.priority) || "P1",
        lane: resolveFirst(params?.lane) || "Content",
        due: resolveFirst(params?.due) || "오늘",
        note: resolveFirst(params?.note) || "",
        source: resolveFirst(params?.source) || "",
      }
    : null;

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">AI · Orders</p>
        <h1>에이전트에게 바로 오더</h1>
        <p>
          챗은 대화, 카운슬은 협의, 여기는 실행 단위입니다. 오더는 타겟 에이전트, 우선순위, 레인, 마감을 달고
          큐로 들어가며, 작업 생성과 수정도 같은 폼에서 처리합니다.
        </p>
      </section>

      <AiOrdersWorkspace
        initialOpenOrders={openOrders}
        initialOrderTemplates={orderTemplates}
        initialDraft={initialDraft}
      />
    </div>
  );
}
