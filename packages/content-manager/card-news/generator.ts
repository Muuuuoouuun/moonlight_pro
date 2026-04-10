export interface CardNewsInput {
  topic: string;
  templateId: string;
}

export async function generateCardNews(input: CardNewsInput) {
  // 기존 classin_cardnews_math_v3.html 기조 유지
  // 템플릿 처리 로직 이식
  console.log("Generating Card News for:", input.topic);
  return { status: "success", topic: input.topic };
}
