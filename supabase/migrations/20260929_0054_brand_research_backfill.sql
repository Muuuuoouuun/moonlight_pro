-- Carry the 2026-09-22/23 brand research and operator answers into brands.meta.
--
-- Sources (the only inputs — nothing here is new research):
--   docs/evaluations/2026-09-20-instagram-reference-audit/brand-direction-operator-decisions-2026-09-23.md
--     (operator table "운영자가 정한 기준" + ClassIn product value)
--   docs/evaluations/2026-09-20-instagram-reference-audit/brand-direction-first-look-2026-09-22.md
--   docs/evaluations/2026-09-20-instagram-reference-audit/brand-profile-observations-2026-09-22.json
--   docs/evaluations/2026-09-20-instagram-reference-audit/classmoon-profile-observations-2026-09-23.json
--     (operator-provided account URLs)
--   docs/superpowers/specs/2026-09-21-brand-research-editorial-system-design.md §1.1·§1.4
--     (operator-stated audiences for politic_officer / class.moon / 22th nomad)
--
-- What it writes, per key, and only when the key is blank (missing, null, "", [] or
-- whitespace) — or, for the few audience/promise/offer/direction/keywords values that the
-- operator's own answers now contradict, only while the value is still byte-identical to
-- what an earlier migration wrote:
--   current_focus            7 brands  — the operator's stated emphasis, not analyst series ideas
--   is_focused               politicofficer, classmoon ("지금 집중할 두 브랜드")
--   channels / source_links  gore, sinabro, 22nomad, classmoon — operator-provided accounts
--   audience/promise/offer   politicofficer, classmoon; audience/offer for 22nomad
--                            (supersedes the 0053 values derived from the 2026-04-27 seed)
--   direction/keywords       22nomad (supersedes seed text tagged source_state =
--                            'inferred_from_seed_notion_blank' in 20260427_0004)
--
-- Guards:
--   * A brand whose identity_confirmed_at is set is never touched — the operator confirmed
--     exactly what is there, and an edit needs a fresh confirmation (brand-identity.test.mjs).
--   * identity_confirmed_at itself is never written. Everything below reads as 권장 (written,
--     unconfirmed) in the Brand tab until the operator confirms it (identityCompleteness).
--   * Values an operator already typed differ from the superseded strings, so they survive.
--   * Re-running is a no-op: no key stays blank and no superseded string remains.
--
-- Deliberately NOT written (need operator input or are operator-approved copy):
--   voice_examples (the research keeps post summaries, not verbatim sentences),
--   philosophy / voice / content_rules / forbidden_terms / cadence / weekly_goal /
--   operating_state / meta.role, and everything on moonpm, studyseagull, classin_side
--   (no research covers them). Known leftovers for the operator to decide:
--   politicofficer philosophy·direction·cadence still describe the April "중립·저빈도"
--   framing, and 22nomad philosophy·voice·rules·cadence still describe a personal archive.

with desired(slug, key, value, supersedes) as (
  values
    -- 정상화 (politicofficer) — 풍자·논평 약 85% / 진지한 논평·비평·가치관 약 15%
    ('politicofficer', 'audience',
      to_jsonb('한국 정치·국제 정세를 풍자와 논평으로 접하고 싶은 젊은 세대 (운영자 지정 우선순위: 2030 → 1020 → 4050)'::text),
      to_jsonb('진영 논리 밖에서 정치·사회 구조를 이해하고 싶은 독자'::text)),
    ('politicofficer', 'promise',
      to_jsonb('공적 선택을 풍자와 논평으로 날카롭게 보되, 부정적인 이야기에만 머물지 않고 지키고 싶은 가치도 함께 말한다'::text),
      to_jsonb('성급한 결론 없이 질문을 남기는 관찰'::text)),
    ('politicofficer', 'offer',
      to_jsonb('풍자·논평 약 85%, 진지한 논평·비평·가치관 공유 약 15%의 시사 콘텐츠'::text),
      to_jsonb('저빈도·순간 기반 정치·사회 관찰 콘텐츠'::text)),
    ('politicofficer', 'current_focus',
      to_jsonb('class.moon과 함께 지금 집중할 두 브랜드 중 하나 — 풍자·논평 약 85%, 진지한 논평·비평·가치관 공유 약 15%로 쌓기'::text),
      null::jsonb),
    ('politicofficer', 'is_focused', 'true'::jsonb, null::jsonb),

    -- class.moon — 직접 고객·도입 결정자는 학원 원장님, 정보는 교육 관계자 모두에게
    ('classmoon', 'audience',
      to_jsonb('학원 원장님(직접 고객·도입 결정자)과 정보를 얻고 싶은 교사·강사 등 교육 관계자'::text),
      to_jsonb('전자칠판·SW 도입을 검토하는 학원장·교육기관 실무자'::text)),
    ('classmoon', 'promise',
      to_jsonb('수업의 품질을 높이고 수업·학생 관리에 드는 리소스를 줄이는 방법을, 제품 설명이 아니라 교육 정보와 현장 사례로 입증해 보여준다'::text),
      to_jsonb('제품 설명이 아니라 같은 현장을 먼저 본 사람의 판단'::text)),
    ('classmoon', 'offer',
      to_jsonb('교육 이슈·교육 팁·교육 테크 활용 정보와 수업 현장 시연·자료 제작 사례, 필요할 때 ClassIn 소개·시연'::text),
      to_jsonb('현장 사례 기반 도입 판단 자료'::text)),
    ('classmoon', 'current_focus',
      to_jsonb('정상화와 함께 지금 집중할 브랜드 — 교육 정보를 학원·기관의 수업 품질·관리 리소스·비용 이득으로 연결하기 (제품 소개에는 확인한 현재 기능·적용 범위만 명시)'::text),
      null::jsonb),
    ('classmoon', 'is_focused', 'true'::jsonb, null::jsonb),
    ('classmoon', 'channels', '["Threads"]'::jsonb, null::jsonb),
    ('classmoon', 'source_links', '["https://www.threads.com/@moon.classin"]'::jsonb, null::jsonb),

    -- 다리 놓는 사람 (bridgemaker)
    ('bridgemaker', 'current_focus',
      to_jsonb('기독교 이야기를 하되 결국 대화를 지향 — 기독교 안에서만 도는 계정이 아니라 세상에 자연스럽게 녹아드는 글로, 변증·논증은 전체의 절반 이하'::text),
      null::jsonb),

    -- 고래 (gore)
    ('gore', 'current_focus',
      to_jsonb('본인이 다시 도전하는 과정에 동기부여와 함께 도전하는 요소 더하기'::text),
      null::jsonb),
    ('gore', 'channels', '["Threads", "Instagram"]'::jsonb, null::jsonb),
    ('gore', 'source_links',
      '["https://www.threads.com/@go_re_startagain", "https://www.instagram.com/go_re_startagain/"]'::jsonb,
      null::jsonb),

    -- 시나브로 (sinabro)
    ('sinabro', 'current_focus',
      to_jsonb('직접 쓴 좋은 시·산문에 더해 좋은 작품과 아티스틱한 것을 공유하기'::text),
      null::jsonb),
    ('sinabro', 'channels', '["Threads"]'::jsonb, null::jsonb),
    ('sinabro', 'source_links', '["https://www.threads.com/@dazz.ling_u"]'::jsonb, null::jsonb),

    -- 기독밈 (holyfuncollector)
    ('holyfuncollector', 'current_focus',
      to_jsonb('즐거운 기독 콘텐츠를 중심에 두기'::text),
      null::jsonb),

    -- 22세기 유목민 (22nomad) — 시드는 빈 Notion에서 추정한 값이었다
    ('22nomad', 'audience',
      to_jsonb('테크를 좋아하는 사람과 새 기술을 배우려는 초보자'::text),
      to_jsonb('다음 선택을 위해 기록을 남기려는 운영자 본인'::text)),
    ('22nomad', 'offer',
      to_jsonb('기술·AI 소식, 직접 써본 실사용, 리뷰'::text),
      to_jsonb('개인 기록과 운영 로그'::text)),
    ('22nomad', 'direction',
      to_jsonb('기술·AI 소식, 실사용, 리뷰를 중심으로 쌓는다.'::text),
      to_jsonb('개인 브랜드 사이트와 공개 메모의 허브로 천천히 정리한다.'::text)),
    ('22nomad', 'keywords',
      '["기술", "AI", "소식", "실사용", "리뷰"]'::jsonb,
      '["개인 기록", "퍼스널 브랜딩", "메모", "운영 로그"]'::jsonb),
    ('22nomad', 'current_focus',
      to_jsonb('기술·AI 소식, 실사용, 리뷰를 중심으로 쌓기 — 우선 범위: GPT/OpenAI, Claude/Anthropic, Google/Gemini, NVIDIA, 미국 실리콘밸리, Grok·Tesla·머스크'::text),
      null::jsonb),
    ('22nomad', 'channels', '["Threads", "Instagram", "YouTube"]'::jsonb, null::jsonb),
    ('22nomad', 'source_links',
      '["https://www.threads.com/@22th.nomad", "https://www.instagram.com/22th.nomad/", "https://www.youtube.com/@22%EC%84%B8%EA%B8%B0%EC%9C%A0%EB%AA%A9%EB%AF%BC"]'::jsonb,
      null::jsonb)
),
needed as (
  select b.id, jsonb_object_agg(d.key, d.value) as patch
  from desired d
  join public.brands b on b.slug = d.slug
  where coalesce(b.meta ->> 'identity_confirmed_at', '') = ''
    and (
      b.meta -> d.key is null
      or b.meta -> d.key in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
      or (jsonb_typeof(b.meta -> d.key) = 'string' and btrim(b.meta ->> d.key) = '')
      or (d.supersedes is not null and b.meta -> d.key = d.supersedes)
    )
  group by b.id
)
update public.brands b
set meta = coalesce(b.meta, '{}'::jsonb) || n.patch,
    updated_at = now()
from needed n
where n.id = b.id;
