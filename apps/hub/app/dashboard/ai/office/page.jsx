import { AiOfficeScene } from "@/components/dashboard/ai-office-scene";
import { getAiOfficePageData } from "@/lib/server-data";

export default async function AiOfficePage() {
  const officeData = await getAiOfficePageData();

  return (
    <div className="app-page">
      <section className="page-head">
        <p className="eyebrow">AI · Situation Deck</p>
        <h1>에이전트 상황실</h1>
        <p>
          AI Console의 숫자, 챗, 카운슬, 오더를 한 장면으로 다시 엮은 읽기 전용 운영 보드입니다. 누가 어디에
          붙어 있는지, 어떤 흐름이 막히는지, 머신 펄스가 어떤 상태인지 먼저 읽는 화면입니다.
        </p>
      </section>

      <AiOfficeScene {...officeData} />
    </div>
  );
}
