# 기회 탐색 — 디자인과 시스템으로 작동하는 넛지

> 상태: 운영자 “넛지는 디자인과 시스템 요소로 더 집중” 및 “고고”로 승인. 기존 2A에 문맥별 행동 강조와 영속적인 억제를 추가한다. 기회별 결과 누적/AI/외부 알림은 이 범위가 아니다.

> 관계: opportunity-discovery-v2-design의 2A 검토일 도래 표시·상세 행동 위계를 이 문서의 단일 제안/영속 억제 계약으로 보강한다. 기존 기회 원장·작업 전환·검색 계약은 유지한다.

## 규칙
기회별 제안 하나. 종료는 없음. 우선순위: 검토일 도래(review) → 결과가 비어 있고 연결한 done 할 일이 있음(result) → 보류는 없음 → 근거 빈칸(evidence) → 가설 빈칸(hypothesis) → 검증 빈칸(experiment) → 검증 결과가 있고 검토일 없는 경우 판단(decision). 단순 경과일로 독촉하지 않음. 결과가 생겼다고 수요 검증 성공이나 프로젝트 생성으로 처리하지 않음.

각 규칙은 ruleId,triggerKey,field,label,reason으로 설명된다. triggerKey는 제목 등 무관한 변경에 안정적이다. review는 날짜, result는 완료 task ID/업데이트 시각과 experiment, 기록 보강은 규칙별 관련 내용, decision은 findings에 연결한다. 실제 필드가 채워지거나 날짜가 미래로 바뀌거나 기록이 종료되면 규칙을 재평가한다.

## 디자인
상세 제목 아래에 현재 제안 하나와 이유,주요 행동 버튼. 버튼은 편집 모드의 해당 입력으로 초점을 옮긴다. 전체 편집은 보조 버튼. 모든 빈칸을 강조하지 않고 필요한 항목만 먼저 보인다. review/decision은 진행 단계·검토 날짜 편집으로 연결한다. 명시적 날짜 선택으로 미루기, 이 제안 숨기기, 숨김 해제 제공. 상단 날짜 도래 표시도 같은 저장 상태를 읽으며 상세가 열리면 뒤의 동일 카드 노출을 접는다.

## 영속성
새 discovery_nudge_states는 workspace/record별 state revision,trigger key,snoozedUntil,dismissed를 가진다. discovery_nudge_receipts는 requestId/payload/response. 별도 RPC로 낙관적 버전 확인과 멱등 저장. 현재 최고 우선 후보를 계산한 후 억제하므로 숨긴 직후 낮은 우선 후보가 대신 튀어나오지 않는다. 미래 snooze는 record 전체에 적용, dismissed는 같은 triggerKey만 억제. resume은 저장된 억제를 해제한다. 버튼 열기 자체는 해소로 기록하지 않는다.

서버 KST 날짜가 정본. 미루기는 내일~1년 이내의 명시 날짜. 읽기 실패면 추천 없는 정상 상태로 위장하지 않고 상태와 재시도 표시. 저장 실패는 성공처럼 숨기지 않으며 같은 요청 재시도 가능. 다른 창에서 변경한 뒤 복귀하면 갱신, 같은 브라우저의 변경 신호로 다른 표면도 갱신한다. 외부 cron/메시지 전송 없음.

## API와 DB 계약
GET /api/hub/discovery/nudge?id=UUID → {status:live|preview|error,context:{recordId,recordRevision,stateRevision,today,candidate:null|{ruleId,triggerKey,field},suppression:null|{kind:snoozed|dismissed,until:null|date},visible:boolean}}. server workspace only. SQL read_discovery_nudge_v1(p_workspace_id uuid,p_record_id uuid) returns same envelope; absent/foreign record returns error no private data.
POST same endpoint → input {recordId,requestId,expectedRevision,triggerKey,action:snooze|dismiss|resume,until:null|date}. SQL save_discovery_nudge_v1(p_workspace_id uuid,p_payload jsonb) returns {status:saved|duplicate|conflict|invalid-input,context}. triggerKey must still match current candidate for snooze/dismiss, resume requires null. Conflict returns fresh context. Tables RLS, service_role SELECT only and RPC EXECUTE; anon/authenticated no access. No discovery snapshot/revision changes from nudge actions.

## 검수
날짜/할 일 완료/기록 보강 순서,무관 수정시 숨김 유지,새로운 계기,선택 날짜 만료,같은 요청 재시도,상충 수정,다른 workspace,누락 migration,편집 포커스,다른 탭/새로고침,모바일·키보드,기존 저장 충돌 계약을 확인한다. 실제 넛지 효과는 클릭 수로 추정하지 않으며 운영 피드백으로 후속 평가한다.

## 적용 상태
2026-09-13 코드 구현·로컬 검증·독립 스펙/품질 리뷰 완료. Migration 0031은 운영 DB에 아직 적용하지 않았으며 운영 배포도 별도다.
