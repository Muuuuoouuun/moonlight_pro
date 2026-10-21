"use client";
// 제품 탭 — 사이드바 `제품` 앵커의 착지(dashboard/products). 2026-09-30 운영자 "09-28 기준으로 확정, 별도 탭 ㄱㄱ".
// 제품은 끝나는 일이 아니라 계속 사는 운영 대상이라 프로젝트 탭의 한 보기에서 나왔다(제품 렌즈 §14.2,
// 브랜드 탭 분리와 같은 이유). 2026-10-21부터 첫 화면은 제품 리스트 + GitHub(개발) 요약이다(ProjectProductsView 머리 주석).
// 프로젝트로 가는 길만 프로젝트 탭 경로로 잇는다.
import React from "react";

import { ProjectProductsView } from "./project-products-view";

export function Products({ onNavigate }) {
  const openProject = React.useCallback((projectId) => {
    onNavigate?.(`dashboard/work/projects?view=table&project=${encodeURIComponent(projectId)}`);
  }, [onNavigate]);

  return (
    <ProjectProductsView
      onOpenProject={openProject}
      heading={(
        <header>
          <h2 className="hub-page-title">제품</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--fg-muted)" }}>
            파는 것과 그 GitHub 저장소 상태를 한 판에서 봐요. MVP·출시·성장은 동시에 3개까지.
          </p>
        </header>
      )}
    />
  );
}
