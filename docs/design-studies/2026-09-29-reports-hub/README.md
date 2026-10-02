# 리포트 허브 목업 (2026-09-29)

> 상태: **목업 · 권장안 (운영자 확정 전)**. 저장소 코드·라우트·DB에는 반영되지 않았다.
> 목업은 Claude Design 캔버스에서 만들었고, 아래 `.dc.html`은 그 캔버스의 아트보드 원본이다. 캔버스 링크: https://claude.ai/artifact/FbGZwX8PyySupubcF1a5yJ (비공개)

## 왜 만들었나
리포트를 한곳에서 모아 보는 화면이 없었다. 주간 리포트 API(`/api/hub/weekly-report`)는 `daily-brief.jsx` 안에서만 보이고, 평가·QA·리서치는 `docs/` 파일로만 존재한다.

## 아트보드
| 파일 | 내용 |
| --- | --- |
| `Main.dc.html` | 리포트 허브 — 주차 묶음·장르 칩·필터·미리보기(일별 추이) |
| `Template.dc.html` | 리포트 템플릿 초안 — 머리말(frontmatter)·공통 뼈대·장르별 섹션표 |
| `Map.dc.html` | 필요한 리포트 8종 지도 — 시점·원천 탭·시간 축·그래프·데이터 준비 |
| `Content-Spec.dc.html` | 본문 글 구성 — 사실/해석/판단 3층, 섹션 규칙, 문장 예시, 데이터 상태 |
| `Report-Personal.dc.html` | 개인 주간 회고 (오늘 3개 3칸 차트, 회고 3질문) |
| `Report-Company.dc.html` | 회사 주간 요약 (캡슐 막대, 단계별 딜, 정체 딜) |
| `Report-Content.dc.html` | 콘텐츠 성과 (브랜드별 조회 추이, 발행 시각 히트맵) |
| `canvas.json` | 캔버스 배치 인덱스 |

`support.js`는 캔버스 런타임 파일이라 포함하지 않았다. 이 폴더의 HTML은 캔버스 링크에서 보는 것이 정본이다.

## 목업 안의 숫자
모든 수치·문장은 형태를 보여 주는 **예시 값**이며 각 화면에 `예시 값 · 목업`으로 표시했다. 실제 원장 값이 아니다. 목업·더미 데이터를 코드에 넣지 않는다는 CLAUDE.md 규칙에 따라 앱 코드로 옮길 때는 값을 원장에서 읽어야 한다.

## 권장안 (확정 전)
- 주차 기준: 그 주 목요일이 속한 달, 월요일 시작. 월·목 아침 리포트는 직전 월–일로 기간을 고정한다. 현재 API는 "어제까지 7일" 롤링이라 주차 라벨과 어긋난다(API는 `periodStart`/`periodEnd` 명시 기간을 받는다).
- 장르는 주간·평가·QA·리서치 4종으로 시작하고, 콘텐츠 성과 등은 지도의 후속 리포트로 둔다.
- 글은 세 층으로 나눈다: 사실(코드가 계산) · 해석(AI 초안, 근거 필수) · 판단(운영자 확정). AI는 숫자를 직접 쓰지 않는다. 측정하지 못한 값은 0이 아니라 "확인 필요"로 쓴다.
- 분석·인사이트·다음 액션은 줄이지 않고 글로 쓴다. 다음 액션 카드는 행동·왜·어떻게·성공 기준·확인일을 갖고, 다음 리포트가 그 카드를 다시 연다.
- 차트: 개인은 하루 3칸(완료=채움, 미완료=윤곽, 미선택=점선), 회사는 이번 주 캡슐 + 전주 윤곽 캡슐. 카테고리 색 없이 명도·선 모양·라벨로 구분한다(DESIGN.md §5).

## 미정 (운영자 결정 필요)
1. 결론 3줄을 AI 초안으로 시작할지, 규칙 문장 템플릿으로 시작할지 (권장: AI 초안 + 수정)
2. 회고 3질문을 리포트 안에 둘지, 하루 리뷰·메모 쪽에 둘지 (목업은 리포트 안)
3. 회사 리포트가 개인 데이터를 참조할지 (권장: 참조하지 않음)
4. 리포트 제목 크기: 목업은 30px, DESIGN.md §11은 페이지 h2 20px — 문서형 예외로 둘지
5. 브랜드 식별자(`politicofficer`·`classmoon`·`22nomad`)는 운영 DB 매핑 확인 전
6. 사이드바 앵커 추가 vs 기존 화면의 더보기 — 표면 예산 규칙(CLAUDE.md)과 충돌하므로 위치 미정

## 근거 자료
`docs/superpowers/specs/2026-09-20-personal-workflow-os-three-axes-and-action-kpi-design.md` · `2026-09-21-eevee-office-moonlight-specialized-roles.md`(월·목 리포트 루틴) · `2026-09-22-office-agent-role-instructions.md` · `2026-09-05-journal-timeline-and-ai-digest.md` · `apps/hub/lib/repositories/weekly-report.js` · `apps/hub/lib/deal-stages.js`
