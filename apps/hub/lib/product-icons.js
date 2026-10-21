// 제품 아이콘 — 제품 id(또는 slug) → 정사각 이미지 주소. 비어 있으면 ProductMark가 모드 질감의 모노그램 타일로 그린다.
// 아이콘은 Codex 이미지 생성으로 만든 192px 타일이다(2026-10-21, `public/icons/products/<id 앞 8자>.png`).
// 새 제품은 아이콘을 만들어 여기 한 줄을 더할 때까지 모노그램 타일로 보인다.
export const PRODUCT_ICON_SRC = {
  "9b0b6350-7439-4664-8644-193acf0ec3a1": "/icons/products/9b0b6350.png", // AIs · AI·SaaS 탐색과 활용
  "a9091b20-1098-4022-b075-e7e0025a8582": "/icons/products/a9091b20.png", // band2sheet · 악보 스튜디오
  "87b7060a-e411-4776-bd35-7adda8efb6bd": "/icons/products/87b7060a.png", // Bible Sparta · 말씀 순례
  "62fd2fc1-501b-404c-a597-831cbfc5afcb": "/icons/products/62fd2fc1.png", // EDB 메이커
  "6db5a023-3947-491b-8cab-24769910571a": "/icons/products/6db5a023.png", // HWP 메이커
  "6fd776fd-8ed8-4def-8072-d43a002369c5": "/icons/products/6fd776fd.png", // OMR 메이커
  "a2787d18-baf2-4ccd-b4bc-1a86efbe70bb": "/icons/products/a2787d18.png", // Worship Together
  "b6dc9200-af97-4066-8cb9-e289674b7095": "/icons/products/b6dc9200.png", // 경제 인텔리전스 플랫폼
  "ae0ee466-3a5e-4f7e-a0d1-0d75c6516917": "/icons/products/ae0ee466.png", // 과학·테크 지식 커뮤니티
  "66fb7359-97bb-4a24-9279-1b9b613a61c4": "/icons/products/66fb7359.png", // 국방 데이터 허브
  "e62e7655-555d-4d02-8b7d-79161567fcef": "/icons/products/e62e7655.png", // 스타트업 커뮤니티
  "41287fd7-51b3-4824-9a4f-35898644a419": "/icons/products/41287fd7.png", // 시나리오 허브
  "111a7f1b-5cf0-4491-b29c-aa1fb5cd83b8": "/icons/products/111a7f1b.png", // 에듀 학습 플랫폼 · 배움곁(가칭)
  "5601011b-dcb9-4bc9-b751-e77bac8832b6": "/icons/products/5601011b.png", // 오라클0 · 예측 커뮤니티
  "49466a90-99bd-4bee-b124-ef47216b4a22": "/icons/products/49466a90.png", // 집중몰입 · 학생 성장 앱
  "19440fed-99c9-497f-a4e4-170e98b323c2": "/icons/products/19440fed.png", // 취업 지원 서비스
  "28869b7f-9d4a-4ba5-9ae5-f751cbc0b23d": "/icons/products/28869b7f.png", // 크리스천 커뮤니티
};

export function productIconSrc(product, icons = PRODUCT_ICON_SRC) {
  return icons[product?.id] || (product?.slug ? icons[product.slug] : null) || null;
}
