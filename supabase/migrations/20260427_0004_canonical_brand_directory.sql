-- Keep the live Supabase brand directory aligned with Hub fallback brands.
--
-- The Hub initially renders the local fallback directory, then replaces it with
-- live rows from `brands`. Missing or differently named live rows make the UI
-- appear to change after loading, so this migration upserts the canonical
-- Moonlight brand scopes for the seeded Com_Moon workspace.

with canonical_brands(slug, name, kind, color_hex, description, meta) as (
  values
    (
      'sinabro', '시나브로', 'content', '#5274a8', '출판·콘텐츠 레이블',
      jsonb_build_object(
        'glyph', '✦', 'tone', 'info', 'order', 10,
        'philosophy', '감정, 언어, 사유의 깊이를 조용히 탐구한다.',
        'direction', '저빈도·고품질로 한 편 한 편의 울림을 축적한다.',
        'voice', '조용하고 깊이 있는 언어, 서두르지 않는 호흡, 내면을 들여다보는 시선',
        'cadence', 'low_frequency_high_quality',
        'keywords', jsonb_build_array('시', '문학', '문화', '내면', '언어'),
        'content_rules', jsonb_build_array('트렌드를 좇지 않는다.', '감정이 준비되지 않았으면 쓰지 않는다.', '언어의 무게를 존중한다.'),
        'forbidden_terms', jsonb_build_array('가벼운 낚시성 훅', '과잉 설명', '트렌드 추종')
      )
    ),
    (
      'gore', '고래(Go;Re)', 'product', '#5274a8', '회복·리커버리 프로덕트',
      jsonb_build_object(
        'glyph', '◌', 'tone', 'company', 'order', 20,
        'philosophy', '루틴과 챌린지를 통해 스스로를 실험하고 회복의 과정을 기록한다.',
        'direction', '30일·100일 같은 챌린지 단위로 시작, 중간, 끝의 서사를 만든다.',
        'voice', '진솔하고 인간적이며 실패를 숨기지 않고 격려하되 강요하지 않는 언어',
        'cadence', 'challenge_based',
        'keywords', jsonb_build_array('도전', '루틴', '인간 실험', '동기부여', '회복'),
        'content_rules', jsonb_build_array('과정을 숨기지 않는다.', '완벽을 추구하지 않는다.', '다른 사람의 도전을 응원한다.'),
        'forbidden_terms', jsonb_build_array('성공 강요', '완벽한 척', '근거 없는 동기부여')
      )
    ),
    (
      'holyfuncollector', 'HolyFunCollector', 'community', '#5274a8', '기독교 신앙을 밈과 유머로 풀어내는 확산형 콘텐츠',
      jsonb_build_object(
        'glyph', '✧', 'tone', 'warning', 'order', 30,
        'philosophy', '신앙의 일상성을 밈과 유머로 가볍게 열어 공감을 만든다.',
        'direction', '짧고 임팩트 있는 고빈도 콘텐츠로 확산성을 실험한다.',
        'voice', '가볍고 유머러스하지만 진정성을 잃지 않는 공감형 밈 언어',
        'cadence', 'high_frequency_viral',
        'keywords', jsonb_build_array('신앙', '밈', '유머', '확산성', '공감'),
        'channels', jsonb_build_array('Instagram'),
        'source_links', jsonb_build_array('https://www.instagram.com/holyfuncollect0r/'),
        'content_rules', jsonb_build_array('신앙을 희화화하지 않는다.', '공감 가능한 일상적 경험을 담는다.', '확산성과 진정성의 균형을 유지한다.'),
        'forbidden_terms', jsonb_build_array('조롱', '내부자만 아는 농담', '신앙의 희화화')
      )
    ),
    (
      'bridgemaker', 'BridgeMaker', 'agency', '#5274a8', '신앙과 삶, 신학과 일상 사이의 다리를 놓는 사유형 콘텐츠',
      jsonb_build_object(
        'glyph', '◇', 'tone', 'moon', 'order', 40,
        'philosophy', '신앙과 삶, 신학과 일상 사이의 연결점을 찾는다.',
        'direction', '질문으로 시작해 사유로 마무리하는 중빈도 콘텐츠를 만든다.',
        'voice', '진지하되 무겁지 않고 질문을 던지며 연결과 통합을 지향하는 언어',
        'cadence', 'mid_frequency_reflective',
        'keywords', jsonb_build_array('신학', '삶', '질문', '다리 놓기', '연결'),
        'channels', jsonb_build_array('Threads', 'Instagram'),
        'source_links', jsonb_build_array('https://www.threads.com/@ml_bridgemaker?hl=ko', 'https://www.instagram.com/p/DXQXgrnn2rR/?img_index=1'),
        'content_rules', jsonb_build_array('답을 강요하지 않는다.', '이분법적 사고를 경계한다.', '연결점을 찾는 데 집중한다.'),
        'forbidden_terms', jsonb_build_array('단정적 정답', '편 가르기', '과도한 설교조')
      )
    ),
    (
      'moonpm', 'MoonPM', 'tool', '#5274a8', 'PM 툴킷과 Moonlight Hub 운영 OS',
      jsonb_build_object(
        'glyph', '◐', 'tone', 'warning', 'order', 50,
        'philosophy', '실무에서 검증된 PM·기획·마케팅 지식을 구조화해 쌓는다.',
        'direction', '다른 브랜드의 백본이 되는 콘텐츠 원천 저장소로 운영한다.',
        'voice', '명확하고 구조화된 실무 언어, 프레임워크 중심 접근',
        'cadence', 'archive_and_selective_share',
        'keywords', jsonb_build_array('PM', '기획', '구조화', '프레임워크', '마케팅'),
        'content_rules', jsonb_build_array('실무에서 검증된 내용만 공유한다.', '추상적 이론보다 구체적 방법론을 우선한다.', '지속적으로 업데이트한다.'),
        'forbidden_terms', jsonb_build_array('검증 없는 방법론', '뜬구름 잡는 이론', '과장된 생산성 약속')
      )
    ),
    (
      'classmoon', 'Class.Moon', 'education', '#5274a8', '에듀테크 현장 기반 세일즈 개인 브랜드',
      jsonb_build_object(
        'glyph', '□', 'tone', 'info', 'order', 60,
        'philosophy', '교육 현장의 실제 문제 해결을 통해 신뢰를 만든다.',
        'direction', '사례 중심 콘텐츠로 가치 제공을 먼저 하고 세일즈는 뒤에 둔다.',
        'voice', '현장감 있는 언어, 관찰자의 시선, 진정성과 전문성의 균형',
        'cadence', 'priority_1_case_led',
        'keywords', jsonb_build_array('에듀테크', '세일즈', '현장', '신뢰', '사례'),
        'content_rules', jsonb_build_array('판매보다 가치 제공이 우선이다.', '과장하지 않는다.', '고객의 실제 변화를 기록한다.', '교육 현장을 존중한다.'),
        'forbidden_terms', jsonb_build_array('과장된 성과', '제품 홍보만 있는 글', '현장 없는 조언')
      )
    ),
    (
      'studyseagull', 'Study.Seagull', 'education', '#5274a8', '학습과 교육에 대한 관찰과 비판을 밈으로 풀어내는 익명 계정',
      jsonb_build_object(
        'glyph', '△', 'tone', 'danger', 'order', 70,
        'philosophy', '교육과 학습의 구조적 문제를 공감 가능한 밈으로 드러낸다.',
        'direction', '익명성과 밈 형식으로 확산성을 확보하되 책임감 있게 비판한다.',
        'voice', '날카롭지만 유머러스하고 구조적 시각을 유지하는 문제 제기',
        'cadence', 'observational_meme',
        'keywords', jsonb_build_array('교육', '공부', '구조', '비판', '관찰', '밈'),
        'content_rules', jsonb_build_array('비판을 위한 비판은 하지 않는다.', '구조를 보고 지적한다.', '공감 가능한 지점을 찾는다.', '익명성을 책임감 있게 사용한다.'),
        'forbidden_terms', jsonb_build_array('개인 공격', '비난만 있는 글', '책임 없는 익명성')
      )
    ),
    (
      'politicofficer', 'Politic_Officer', 'research', '#5274a8', '정치와 사회 현상을 관찰하고 질문을 던지는 실험적 채널',
      jsonb_build_object(
        'glyph', '◎', 'tone', 'info', 'order', 80,
        'philosophy', '정치와 사회 현상을 중립적으로 관찰하되 무관심하지 않게 질문한다.',
        'direction', '중요한 순간에만 저빈도로 발행하며 장기적 구조 이해를 축적한다.',
        'voice', '질문 중심, 구조를 보려는 시도, 감정보다 논리를 우선하되 인간을 잊지 않는 태도',
        'cadence', 'low_frequency_moment_based',
        'keywords', jsonb_build_array('정치', '관찰', '질문', '사회', '사유', '구조'),
        'channels', jsonb_build_array('Threads', 'Instagram'),
        'source_links', jsonb_build_array('https://www.threads.com/@politic_officer?hl=ko', 'https://www.instagram.com/politic_officer/'),
        'content_rules', jsonb_build_array('이분법적 사고를 경계한다.', '섣부른 결론을 내리지 않는다.', '구조적 이해를 추구한다.', '감정보다 논리를 우선하되 인간을 잊지 않는다.'),
        'forbidden_terms', jsonb_build_array('진영 논리', '성급한 단정', '혐오 조장')
      )
    ),
    (
      '22nomad', '22th.Nomad', 'personal', '#5274a8', '개인 블로그·메모',
      jsonb_build_object(
        'glyph', '◻', 'tone', 'personal', 'order', 90,
        'philosophy', '개인의 이동, 기록, 운영 로그를 남겨 다음 선택의 재료로 만든다.',
        'direction', '개인 브랜드 사이트와 공개 메모의 허브로 천천히 정리한다.',
        'voice', '담백하고 개인적인 기록, 지나친 포장보다 실제 맥락',
        'cadence', 'personal_archive',
        'keywords', jsonb_build_array('개인 기록', '퍼스널 브랜딩', '메모', '운영 로그'),
        'content_rules', jsonb_build_array('실제 경험을 우선한다.', '과장된 자기브랜딩을 피한다.', '다음 선택에 남는 기록으로 닫는다.'),
        'forbidden_terms', jsonb_build_array('빈 자기홍보', '근거 없는 선언'),
        'source_state', 'inferred_from_seed_notion_blank'
      )
    )
)
insert into public.brands (workspace_id, slug, name, kind, color_hex, description, meta)
select
  w.id,
  c.slug,
  c.name,
  c.kind,
  c.color_hex,
  c.description,
  c.meta
from public.workspaces w
cross join canonical_brands c
where w.slug = 'com-moon-os'
   or w.id = '11111111-1111-1111-1111-111111111111'
on conflict (workspace_id, slug) do update
set
  name = excluded.name,
  kind = excluded.kind,
  status = 'active',
  color_hex = excluded.color_hex,
  description = excluded.description,
  meta = public.brands.meta || excluded.meta,
  updated_at = now();
