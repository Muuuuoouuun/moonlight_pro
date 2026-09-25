"use client";

import React from "react";
import { GURU_CARDS } from "@com-moon/guru-guidance";
import { TruthBadge } from "./hub-primitives";
import { GuidanceSourceReader } from "./guidance-source-reader";
import "./guru-recommendation.css";

// 기록 기반 추천 한 장 — 오늘·홈·고객 상세·거래 상세·Office 결과가 같은 모양을 쓴다
// (agent-layer-direction §2.1 ⑦). 근거 사실을 항상 함께 보이고, 원문 열람과 질문은 운영자가
// 누를 때만 일어난다. 카드를 여는 것만으로는 조언·알림·업무를 만들지 않는다.
//
// recommendation: guru-recommendations.js(기록) 또는 agenda-guidance.js(안건 문구)의 결과.
// onAsk(card, context): 있으면 "이 관점으로 질문" — ClassIn 레인이 확인된 기록에만 넘긴다.

const CARD_BY_ID = new Map(GURU_CARDS.map((card) => [card.id, card]));

export function guruRecommendationCard(recommendation) {
  return recommendation?.cardId ? CARD_BY_ID.get(recommendation.cardId) || null : null;
}

// 질문 드로어가 받는 문맥 — 화면에 보인 근거 사실만 싣는다.
export function recommendationAskContext(recommendation) {
  const subject = recommendation?.subject;
  if (!subject?.id || subject.lane !== "classin" || subject.laneBlocked) return null;
  return { label: subject.name || "", ref: String(subject.id), facts: [...(recommendation.facts || [])] };
}

export function GuruRecommendation({ recommendation, onAsk, showSubject = false, compact = false, className = "" }) {
  const card = guruRecommendationCard(recommendation);
  const [sourceOpen, setSourceOpen] = React.useState(false);
  const readerId = React.useId();
  if (!recommendation || !card) return null;

  const basis = recommendation.basis === "agenda" ? "안건 문구 기준" : "기록 기반 추천";
  const askContext = recommendation.basis === "agenda" ? {} : recommendationAskContext(recommendation);
  const canAsk = typeof onAsk === "function" && askContext != null;

  return (
    <section
      className={`guru-rec${compact ? " guru-rec--compact" : ""}${className ? ` ${className}` : ""}`}
      aria-label={`${basis}: ${card.personName} · ${card.methodLabel}`}
    >
      <div className="guru-rec__head">
        <span className="guru-rec__eyebrow">{basis}</span>
        {showSubject && recommendation.subject?.name ? <span className="guru-rec__subject">{recommendation.subject.name}</span> : null}
      </div>
      <p className="guru-rec__method">{card.personName} · {card.methodLabel}</p>
      <p className="guru-rec__question">“{card.question}”</p>
      <p className="guru-rec__why">
        <span className="guru-rec__why-label">근거</span>
        <span>{(recommendation.facts || []).join(" · ")}</span>
      </p>
      {recommendation.subject?.laneBlocked ? (
        <div className="guru-rec__note"><TruthBadge state="partial" label="소속 확인 필요" reason="회사·개인 소속이 엇갈려 질문은 열지 않습니다" /></div>
      ) : null}
      <div className="guru-rec__actions">
        <button
          type="button"
          className="guru-rec__action"
          aria-expanded={sourceOpen}
          aria-controls={sourceOpen ? readerId : undefined}
          onClick={() => setSourceOpen((open) => !open)}
        >
          {sourceOpen ? "원문 접기" : "원문 보기"}
        </button>
        {canAsk ? (
          <button type="button" className="guru-rec__action guru-rec__action--ask" onClick={() => onAsk(card, askContext)}>
            이 관점으로 질문
          </button>
        ) : null}
      </div>
      {sourceOpen ? (
        <GuidanceSourceReader id={readerId} cardId={card.id} onClose={() => setSourceOpen(false)} headingLevel={5} className="guru-rec__reader" />
      ) : null}
    </section>
  );
}

// 목록 표면(오늘·홈)용 — 지금 할 것(act) 몇 개만. 읽기 실패는 숨기지 않고, 추천이 없으면 아무것도
// 그리지 않는다(첫 화면에 빈 칸을 늘리지 않는다). preview는 다른 첫 화면 영역이 이미 알린다.
export function GuruRecommendationList({ result, onAsk, limit = 3, title = "기록 기반 추천", onRetry, className = "" }) {
  if (!result || result.status === "loading" || result.status === "idle" || result.status === "preview") return null;
  if (result.status === "error") {
    return (
      <section className={`guru-rec-list${className ? ` ${className}` : ""}`} aria-label={title}>
        <div className="guru-rec-list__head"><span className="guru-rec__eyebrow">{title}</span></div>
        <div className="guru-rec-list__status">
          <TruthBadge state="error" reason="기록 기반 추천을 불러오지 못했습니다" />
          {onRetry ? <button type="button" className="guru-rec__action" onClick={onRetry}>다시 불러오기</button> : null}
        </div>
      </section>
    );
  }
  const items = (Array.isArray(result.recommendations) ? result.recommendations : [])
    .filter((rec) => rec?.severity === "act")
    .slice(0, limit);
  if (!items.length) return null;
  return (
    <section className={`guru-rec-list${className ? ` ${className}` : ""}`} aria-label={title}>
      <div className="guru-rec-list__head">
        <span className="guru-rec__eyebrow">{title}</span>
        {result.status === "partial" ? <TruthBadge state="partial" reason="연락 기록 일부를 읽지 못했습니다" /> : null}
      </div>
      <ul className="guru-rec-list__items">
        {items.map((rec) => (
          <li key={rec.id}><GuruRecommendation recommendation={rec} onAsk={onAsk} showSubject compact /></li>
        ))}
      </ul>
    </section>
  );
}
