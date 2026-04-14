export interface CardNewsInput {
  topic: string;
  templateId: string;
}

export interface CardNewsResult {
  status: "success";
  topic: string;
  templateId: string;
  title: string;
  summary: string;
  slideCount: number;
  generatedAt: string;
}

export async function generateCardNews(input: CardNewsInput): Promise<CardNewsResult> {
  const topic = input.topic.trim();
  const templateId = input.templateId.trim();

  if (!topic) {
    throw new Error("Card news topic is required.");
  }

  if (!templateId) {
    throw new Error("Card news templateId is required.");
  }

  return {
    status: "success",
    topic,
    templateId,
    title: `${topic} 카드뉴스`,
    summary: `${templateId} 템플릿 기반 카드뉴스 초안을 준비했습니다.`,
    slideCount: 5,
    generatedAt: new Date().toISOString(),
  };
}
