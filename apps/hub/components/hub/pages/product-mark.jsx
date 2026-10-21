"use client";
// 제품 정체성 — 제품 리스트(D)·포트폴리오(12a-1)·제품 상세(12d)가 같은 마크 하나로 제품을 그린다(2026-10-21).
// 아이콘(lib/product-icons.js)이 있으면 1:1 이미지, 없으면 이름 첫 글자 모노그램 타일. 타일은 색이 아니라 모드 질감으로
// 말한다(제품 렌즈 §14.3): 운영중 채운 타일 · 제작중 빗금 + 점선 · 중지 빈 실선 · 기획 점 테두리 · 종료 흐린 실선.
import React from "react";

import { productMode } from "../../../lib/product-catalog.js";
import { productIconSrc } from "../../../lib/product-icons.js";
import styles from "./product-room.module.css";

const SIZE = { sm: 24, md: 34, lg: 56 };

export function ProductMark({ product, size = "md" }) {
  const px = SIZE[size] || SIZE.md;
  const src = productIconSrc(product);
  const name = product?.name || "제품";
  if (src) return <img src={src} alt={name} width={px} height={px} className={`${styles.mark} ${styles[`mark_${size}`] || ""}`} />;
  return (
    <span aria-hidden="true" data-mode={productMode(product).value} className={`${styles.mark} ${styles.markTile} ${styles[`mark_${size}`] || ""}`}>
      {Array.from(name.trim())[0] || "?"}
    </span>
  );
}

// 모드 글리프 + 글자 — 색 없음(DESIGN §5.3 lifecycle).
export function ModeLabel({ product }) {
  const mode = productMode(product);
  return (
    <span className={styles.ops}>
      <span className={styles.opsGlyph} aria-hidden="true">{mode.glyph}</span>
      {mode.label}
    </span>
  );
}
