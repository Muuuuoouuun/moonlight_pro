export interface CardNewsInput {
  topic: string;
  templateId: string;
}

// Slide fields mirror the Hub Studio carousel editor ({title, sub}); the engine decorates
// them with presentation fields (id, bg) before persisting so drafts open directly in Studio.
export interface CardNewsSlide {
  title: string;
  sub: string;
}

export interface CardNewsResult {
  status: "success";
  topic: string;
  templateId: string;
  title: string;
  summary: string;
  slides: CardNewsSlide[];
  slideCount: number;
  model: string;
  generatedAt: string;
}

// Text-generation capability injected by the caller. Structurally matches
// apps/engine/lib/gemini.ts generateGeminiText so the engine passes it straight through —
// this package stays dependency-free instead of importing an app's client.
export interface CardNewsTextGenerator {
  (input: {
    prompt: string;
    systemInstruction?: string;
    maxOutputTokens?: number;
    responseMimeType?: string;
    thinkingBudget?: number;
  }): Promise<{ ok: boolean; reason: string; text: string; model: string }>;
}

const SYSTEM_INSTRUCTION = [
  "당신은 한국어 카드뉴스(인스타그램 캐러셀) 작가입니다.",
  "첫 슬라이드는 스크롤을 멈추게 하는 훅, 마지막 슬라이드는 독자의 다음 행동(CTA)입니다.",
  "슬라이드마다 title(핵심 한 문장, 20자 내외)과 sub(보조 설명 한 줄, 30자 내외)를 씁니다.",
  "과장·보장·단정과 '혁신적·차세대·시너지' 같은 마케팅 상투어를 금지합니다. 구체적 사실과 예시로 씁니다.",
  "이 초안은 자동 발행되지 않습니다 — 운영자가 검토·승인하는 draft로만 저장됩니다.",
].join("\n");

function buildPrompt(topic: string, templateId: string) {
  return [
    `주제: ${topic}`,
    `템플릿: ${templateId}`,
    "",
    "위 주제로 카드뉴스 초안을 만들어라. 슬라이드는 5~7장:",
    "- 1장: 훅(표지) — 주제를 궁금하게 만드는 헤드라인",
    "- 중간: 핵심 메시지를 슬라이드당 하나씩, 구체 예시 포함",
    "- 마지막 장: 독자의 다음 행동 CTA",
    "",
    "출력은 아래 JSON 객체 하나만. 설명·머리말·코드펜스 없이 JSON만:",
    '{"title": "카드뉴스 전체 제목 (40자 내외)", "summary": "전체 요약 1~2문장", "slides": [{"title": "슬라이드 핵심 문장 (20자 내외)", "sub": "보조 설명 한 줄 (30자 내외)"}]}',
  ].join("\n");
}

// Parse the JSON contract; tolerant of code fences (same tolerance as the Council
// content-draft parser). Null on any shape violation — the caller must fail the run
// rather than persist a partial draft.
function parseCardNewsDraft(
  text: string,
): { title: string; summary: string; slides: CardNewsSlide[] } | null {
  if (!text) return null;
  let raw = text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  }

  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof obj?.title !== "string" || !obj.title.trim()) return null;
  if (typeof obj?.summary !== "string" || !obj.summary.trim()) return null;
  if (!Array.isArray(obj?.slides) || obj.slides.length < 3 || obj.slides.length > 10) return null;

  const slides: CardNewsSlide[] = [];
  for (const slide of obj.slides) {
    const title = typeof slide?.title === "string" ? slide.title.trim() : "";
    if (!title) return null;
    const sub = typeof slide?.sub === "string" ? slide.sub.trim() : "";
    slides.push({ title, sub });
  }

  return { title: obj.title.trim(), summary: obj.summary.trim(), slides };
}

export async function generateCardNews(
  input: CardNewsInput,
  generateText: CardNewsTextGenerator,
): Promise<CardNewsResult> {
  const topic = input.topic.trim();
  const templateId = input.templateId.trim();

  if (!topic) {
    throw new Error("Card news topic is required.");
  }

  if (!templateId) {
    throw new Error("Card news templateId is required.");
  }

  const result = await generateText({
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt: buildPrompt(topic, templateId),
    // Same bounds as the Council content-draft mode: JSON at the API layer plus a capped
    // thinking budget so a runaway think can't truncate the JSON mid-object.
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
    thinkingBudget: 512,
  });

  if (!result.ok) {
    // No canned fallback: mock and live ledger data never mix, so a failed generation must
    // fail the run instead of persisting a fake draft.
    throw new Error(`Card news generation failed: ${result.reason}`);
  }

  const draft = parseCardNewsDraft(result.text);

  if (!draft) {
    throw new Error(
      "Card news generation returned an invalid JSON draft (expected {title, summary, slides[]}).",
    );
  }

  return {
    status: "success",
    topic,
    templateId,
    title: draft.title,
    summary: draft.summary,
    slides: draft.slides,
    slideCount: draft.slides.length,
    model: result.model,
    generatedAt: new Date().toISOString(),
  };
}
