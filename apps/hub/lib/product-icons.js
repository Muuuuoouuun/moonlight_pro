// 제품 아이콘 — 제품 id(또는 slug) → 정사각 이미지 주소. 비어 있으면 ProductMark가 모드 질감의 모노그램 타일로 그린다.
// 아이콘은 나중에 따로 채운다(2026-10-21). 예: { "<product id>": "/product-icons/omr.png" }
export const PRODUCT_ICON_SRC = {};

export function productIconSrc(product, icons = PRODUCT_ICON_SRC) {
  return icons[product?.id] || (product?.slug ? icons[product.slug] : null) || null;
}
