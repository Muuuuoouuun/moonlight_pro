"use client";
// 제품 탭 — 사이드바 `제품` 앵커의 착지(dashboard/products). 2026-09-30 운영자 "09-28 기준으로 확정, 별도 탭 ㄱㄱ".
// 제품은 끝나는 일이 아니라 계속 사는 운영 대상이라 프로젝트 탭의 한 보기에서 나왔다(제품 렌즈 §14.2,
// 브랜드 탭 분리와 같은 이유). 화면은 ProjectProductsView 머리 주석 — 개발(D) · 포트폴리오(12a-1) · 상세(12d), 2026-10-21.
// 프로젝트·보드로 가는 길만 프로젝트 탭 경로로 잇는다.
import React from "react";

import { ProjectProductsView } from "./project-products-view";

export function Products({ onNavigate }) {
  const openProject = React.useCallback((projectId) => {
    onNavigate?.(`dashboard/work/projects?view=table&project=${encodeURIComponent(projectId)}`);
  }, [onNavigate]);
  const openBoard = React.useCallback((productId) => {
    onNavigate?.(`dashboard/work/projects?view=board&taskProduct=${encodeURIComponent(productId)}`);
  }, [onNavigate]);

  return <ProjectProductsView onOpenProject={openProject} onOpenBoard={openBoard} />;
}
