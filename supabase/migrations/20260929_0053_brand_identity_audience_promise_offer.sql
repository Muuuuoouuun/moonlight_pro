-- Fill audience/promise/offer for the 9 canonical brands.
--
-- 2026-09-14 shipped BRAND_IDENTITY_FIELDS (11 fields) but the 2026-04-27 seed
-- (20260427_0004_canonical_brand_directory.sql) only ever populated 6 of them
-- (philosophy/direction/voice/keywords/content_rules/forbidden_terms). This
-- backfills audience/promise/offer from that same seed's own philosophy/
-- direction/content_rules text — no new claims, just the existing approved
-- copy read into the newer schema.
--
-- Deliberately NOT included: current_focus, voice_examples. Both require
-- genuinely new operator-only input (real current work state, real example
-- sentences) that this migration cannot derive from existing docs — see
-- docs/superpowers/specs/2026-09-03-sales-content-marketing-to-branding-growth-plan.md
-- §2 "빠져 있는 사실" (no confirmed current-focus statement exists for any
-- brand). Also not included: meta.role, meta.weekly_goal — both are
-- operator decision items (growth plan §8 B-4, §12 Q2), not yet confirmed.
--
-- meta || jsonb_build_object(...) only adds these three keys; every existing
-- key (philosophy, voice, cadence, channels, org_scope, …) is preserved
-- untouched, same merge pattern as 20260710_0012_classin_side_brand_and_org_scope.sql.
-- classin_side is intentionally excluded — it has no philosophy/direction to
-- derive from yet ("설명 추후 보완"), so inventing audience/promise/offer for
-- it would misrepresent an empty identity as a written one.

update public.brands set meta = meta || jsonb_build_object(
  'audience', '시와 문학으로 감정과 사유의 깊이를 탐구하고 싶은 독자',
  'promise', '서두르지 않는 언어로 내면을 들여다보는 시간',
  'offer', '저빈도·고품질 시와 글'
), updated_at = now() where slug = 'sinabro';

update public.brands set meta = meta || jsonb_build_object(
  'audience', '루틴과 챌린지로 스스로를 실험하고 회복하려는 사람',
  'promise', '완벽하지 않아도 과정을 숨기지 않는 회복의 기록',
  'offer', '30일·100일 단위 챌린지 콘텐츠'
), updated_at = now() where slug = 'gore';

update public.brands set meta = meta || jsonb_build_object(
  'audience', '신앙생활의 일상적 순간에 공감하는 사람',
  'promise', '신앙을 가볍게, 그러나 진정성 있게 웃을 수 있는 자리',
  'offer', '짧고 확산성 있는 신앙 밈 콘텐츠'
), updated_at = now() where slug = 'holyfuncollector';

update public.brands set meta = meta || jsonb_build_object(
  'audience', '신앙과 삶, 신학과 일상 사이에서 질문을 가진 사람',
  'promise', '답을 강요하지 않고 연결점을 찾는 사유',
  'offer', '질문으로 시작해 사유로 마무리하는 중빈도 글'
), updated_at = now() where slug = 'bridgemaker';

update public.brands set meta = meta || jsonb_build_object(
  'audience', '실무에서 검증된 PM·기획·마케팅 지식이 필요한 사람 (1차는 운영자 본인)',
  'promise', '다른 브랜드가 바로 꺼내 쓸 수 있는 구조화된 실무 지식',
  'offer', 'PM·기획·마케팅 프레임워크 저장소'
), updated_at = now() where slug = 'moonpm';

update public.brands set meta = meta || jsonb_build_object(
  'audience', '전자칠판·SW 도입을 검토하는 학원장·교육기관 실무자',
  'promise', '제품 설명이 아니라 같은 현장을 먼저 본 사람의 판단',
  'offer', '현장 사례 기반 도입 판단 자료'
), updated_at = now() where slug = 'classmoon';

update public.brands set meta = meta || jsonb_build_object(
  'audience', '교육·학습의 구조적 문제에 공감하는 독자',
  'promise', '비난이 아니라 공감 가능한 지점에서 구조를 짚는 시선',
  'offer', '관찰형 밈 콘텐츠'
), updated_at = now() where slug = 'studyseagull';

update public.brands set meta = meta || jsonb_build_object(
  'audience', '진영 논리 밖에서 정치·사회 구조를 이해하고 싶은 독자',
  'promise', '성급한 결론 없이 질문을 남기는 관찰',
  'offer', '저빈도·순간 기반 정치·사회 관찰 콘텐츠'
), updated_at = now() where slug = 'politicofficer';

update public.brands set meta = meta || jsonb_build_object(
  'audience', '다음 선택을 위해 기록을 남기려는 운영자 본인',
  'promise', '과장 없는 실제 맥락의 기록',
  'offer', '개인 기록과 운영 로그'
), updated_at = now() where slug = '22nomad';
