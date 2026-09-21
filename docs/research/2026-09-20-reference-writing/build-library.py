"""Rebuild this archive from preserved inputs only; no network or app writes.

Run with Python 3 from any working directory. Historical locations in manifests
are provenance, not inputs. The 17 source snapshots must retain their hashes.
"""
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
YT = ROOT / 'sources' / 'youtube'
IG = ROOT / 'sources' / 'instagram'
TH = IG

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

for entry in read_json(ROOT / 'source-manifest.json')['files']:
    target = (ROOT / entry['preserved_path']).resolve()
    if not target.is_relative_to(ROOT / 'sources'):
        raise ValueError('Snapshot path must stay inside sources/: ' + entry['preserved_path'])
    content = target.read_bytes()
    if len(content) != entry['bytes'] or hashlib.sha256(content).hexdigest() != entry['sha256']:
        raise ValueError('Preserved snapshot changed: ' + entry['preserved_path'])

summaries = {}
for name in ['01-growth.md', '02-learning.md', '03-life.md']:
    document = (YT / name).read_text(encoding='utf-8')
    for match in re.finditer(r'<a id="([^"]+)"></a>\n(.*?)(?=\n<a id="|\Z)', document, re.S):
        video_id, block = match.groups()
        paragraphs = block.strip().split('\n\n')
        summary = paragraphs[2] if len(paragraphs) > 2 and not paragraphs[2].startswith(('-', '**', '참고')) else ''
        summaries.setdefault(video_id, {
            'summary': summary,
            'key_points': re.findall(r'^- (.+)$', block, re.M),
            'source_locators': [{'label': a, 'url': b} for a, b in re.findall(r'\[([^\]]+)\]\((https://www.youtube.com/watch\?v=[^)]*&t=[^)]*)\)', block)],
            'previous_application_suggestion': re.search(r'\*\*적용 제안:\*\* (.+)', block).group(1) if re.search(r'\*\*적용 제안:\*\* (.+)', block) else '',
            'coverage_note': re.search(r'^확인 범위: (.+)', block, re.M).group(1) if re.search(r'^확인 범위: (.+)', block, re.M) else '',
        })

csv_rows = list(csv.DictReader((YT / 'inventory.csv').open(encoding='utf-8-sig', newline='')))
csv_by_id = {re.search(r'[?&]v=([^&]+)', row['원본URL']).group(1): row for row in csv_rows}
records = {}
for r in read_json(YT / 'coverage.json')['records']:
    ident = 'yt:' + r['video_id']
    if ident in records:
        records[ident]['memberships'].append({'collection': r['playlist'], 'order': r['order']})
        continue
    s = summaries.get(r['video_id'], {})
    row = csv_by_id[r['video_id']]
    records[ident] = {
        'id': ident, 'source_id': r['video_id'], 'platform': 'YouTube 영상',
        'title': r['title'], 'author': r['channel'], 'url': r['url'],
        'memberships': [{'collection': r['playlist'], 'order': r['order']}],
        'tags': r['tags'], 'evidence_level': r['status'],
        'analysis_basis': r['analysis_basis'], 'summary': '' if r['status'] == '내용 미확보' else s.get('summary') or row['한줄요약'],
        'summary_origin': '내용 미확보·제목과 접근 상태만 보존' if r['status'] == '내용 미확보' else '이전 작업의 AI 요약. 이번 통합에서 전편 재검증하지 않음.',
        'key_points': s.get('key_points', []), 'source_locators': s.get('source_locators', []),
        'coverage_note': s.get('coverage_note', ''),
        'previous_application_suggestion': s.get('previous_application_suggestion', ''),
        'details': 'sources/youtube/' + r['detail_file'],
        'transcript_collected_previously': r['transcript_collected'],
        'fact_check': '독립 사실 검증 없음', 'rechecked_in_this_run': False,
    }

saved = read_json(IG / 'saved-records.json')['records']
scope_labels = {
    'caption_only': '이전 캡션 분류',
    'caption_and_downloaded_static_image': '이전 캡션·이미지 1장 확인',
    'caption_and_carousel_slides_2_3_4': '이전 캡션·일부 슬라이드 확인',
    'caption_and_selected_playback_frame': '이전 캡션·일부 영상 화면 확인',
    'caption_and_grid_thumbnail': '이전 캡션·썸네일 확인',
}
for r in saved:
    ident = 'ig:' + r['shortcode']
    assert ident not in records
    records[ident] = {
        'id': ident, 'source_id': r['id'], 'platform': 'Instagram',
        'title': r['analysis_title'], 'title_origin': '이전 분석자가 작성한 제목',
        'author': r['author'], 'url': r['url'],
        'memberships': [{'collection': '인스타 저장·비즈니스', 'order': int(r['id'][1:])}],
        'tags': [r['proposed_topic'] or r['proposed_category']], 'evidence_level': scope_labels[r['analysis_scope']],
        'analysis_basis': r['analysis_scope'], 'summary': '',
        'summary_origin': '기존 파일에는 원 캡션 전문과 상세 요약이 없음. 정리 제목을 원문 요약으로 확장하지 않음.',
        'key_points': [], 'source_locators': [],
        'coverage_note': '릴스 전체 음성·캐러셀 전체를 확인한 자료가 아님.',
        'details': 'sources/instagram/saved-index.md',
        'previous_confidence': r['confidence'], 'previous_review_state': r['review_state'],
        'fact_check': '독립 사실 검증 없음', 'rechecked_in_this_run': False,
    }

dm = read_json(IG / 'dm-records.json')['records']
for r in dm:
    url = r.get('observed_author_permalink') or r['observed_url']
    match = re.search(r'/(?:p|reel)/([^/?]+)', url)
    ident = 'ig:' + match.group(1) if r['platform'] == 'Instagram' and match else 'external:' + r['id']
    if ident in records:
        records[ident]['memberships'].append({'collection': '지정 DM 공유자료', 'source_id': r['id']})
        continue
    records[ident] = {
        'id': ident, 'source_id': r['id'], 'platform': 'Instagram' if r['platform'] == 'Instagram' else ('YouTube 커뮤니티' if 'youtu' in url else 'Facebook'),
        'title': r['content_summary'].split('。')[0], 'title_origin': '이전 분석자의 요약을 제목으로 사용',
        'author': r['author'], 'url': url,
        'memberships': [{'collection': '지정 DM 공유자료', 'source_id': r['id']}],
        'tags': [r['category_interpretation']] + r.get('tags_interpretation', []),
        'evidence_level': '이전 게시물 캡션 확인' if r['platform'] == 'Instagram' else '공유 미리보기·본문 미확보',
        'analysis_basis': r['evidence'], 'summary': r['content_summary'],
        'summary_origin': '이전 작업이 확인한 캡션·미리보기의 요약. 영상 전체 분석이 아님.',
        'key_points': [], 'source_locators': [],
        'coverage_note': '지정 DM 일부에서 발견한 공유자료. 대화 전체 수집이 아니며 별도 사적 대화 문장은 없음.',
        'details': 'sources/instagram/dm-audit.md',
        'fact_check': '독립 사실 검증 없음', 'rechecked_in_this_run': False,
    }

theme_map = [
    ('학습·생각·글쓰기', {'학습·기록', '공부법', '과학적 사고'}),
    ('고객·설득·브랜드', {'영업·협상', '마케팅·브랜딩', '사업·브랜딩', '웹 디자인·브랜딩', '연봉협상'}),
    ('제품·창업·AI', {'창업·제품', 'AI 업무 자동화', '앱·제품 제작', '도구·AI'}),
    ('협업·리더십', {'조직·리더십', '사업·조직 운영'}),
    ('실행·지속·회복', {'실행·습관', '성장·실행', '회복·감정', '동기부여', '자기계발'}),
    ('가치·관계·삶', {'신앙·가치', '소통·관계', '연애'}),
    ('제작 방식·영감', {'영상 제작·편집', '음악·인터랙션'}),
    ('별도 확인·배경', {'건강', '경제·투자', '확인 필요', '내용 확인 필요', '주제 재검토', '주제 미확인 외부 링크'}),
]
for r in records.values():
    r['themes'] = [name for name, tags in theme_map if tags.intersection(r['tags'])] or ['별도 확인·배경']
    r['curated_insights'] = []

for filename in ['youtube-insights.json', 'instagram-insights.json']:
    path = ROOT / filename
    insights = read_json(path)
    if isinstance(insights, dict):
        insights = insights.get('insights', insights.get('records', []))
    for insight in insights:
        sid = insight.get('source_id', '')
        url = insight.get('url', '')
        candidates = [r for r in records.values() if r['source_id'] == sid or r['url'] == url or (r['platform'] == 'YouTube 영상' and r['source_id'] in url)]
        for record in candidates:
            record['curated_insights'].append(insight)
            record['curated_in_this_run'] = True

for record in records.values():
    insights = record['curated_insights']
    record.pop('rechecked_in_this_run', None)
    record['curated_in_this_run'] = bool(insights)
    record['primary_evidence_rechecked'] = bool(insights) and (record['platform'] == 'Instagram' or any(x['evidence_level'].startswith('A —') for x in insights))
    record['current_summary'] = insights[0]['observed_claim'] if insights else ''
    record['display_title'] = insights[0]['title'] if insights else record['title']

data = list(records.values())
threads = read_json(TH / 'threads-dm-records.json')
assert len(csv_rows) == 296
assert len([r for r in data if r['platform'] == 'YouTube 영상']) == 265
assert len([r for r in data if r['platform'] == 'YouTube 영상' and r['summary']]) == 264
assert len({r['id'] for r in data}) == len(data)
assert all(urlparse(r['url']).scheme in {'https', 'http'} for r in data)
counts = {
    'unique_records': len(data), 'original_membership_rows': len(csv_rows) + len(saved) + len(dm),
    'duplicate_membership_rows': len(csv_rows) + len(saved) + len(dm) - len(data),
    'platforms': dict(Counter(r['platform'] for r in data)),
    'previous_evidence_levels': dict(Counter(r['evidence_level'] for r in data)),
    'themes_multi_label': dict(Counter(t for r in data for t in r['themes'])),
    'curated_source_count': sum(bool(r['curated_insights']) for r in data),
    'primary_content_rechecked': sum(r['primary_evidence_rechecked'] for r in data),
    'prior_analysis_reviewed_only': sum(r['curated_in_this_run'] and not r['primary_evidence_rechecked'] for r in data),
    'saved_instagram_low_confidence': sum(r['confidence'] == 'low' for r in saved),
    'supplementary_profile_references': len(threads['records']),
    'supplementary_profile_discovery_posts': len(threads['supplementary_evidence']),
    'coverage_gaps': ['YouTube 숨겨진 목록행 38개는 미확보(고유영상수 아님)', 'YouTube 회원전용 1편 내용 미확보', '지정 DM 표본·추가 저장폴더 9개 미수집', 'DM 접근불가 공유 1건은 URL이 없어 통합목록에서 제외'],
}
write_json(ROOT / 'library.json', {'schema_version': 1, 'updated_at': '2026-09-20', 'counts': counts, 'classification_note': '기존 태그를 활용 목적별로 묶은 편집상 분류. 사용자 선호·진실성 점수 아님. Threads 공유 프로필2개와 탐색용 게시물5개는 370개 기록에서 분리.', 'records': data, 'supplementary_profiles': threads['records'], 'profile_discovery_evidence': threads['supplementary_evidence']})
write_json(ROOT / 'coverage.json', counts)

with (ROOT / 'library.csv').open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(['자료ID','플랫폼','정리제목','제작자','원본URL','원래목록','활용주제','이전확인수준','기존요약','이번확인주장','이번선별검토','선별인사이트','적용조건','내경험질문','상세정리'])
    for r in data:
        c = r['curated_insights']
        cells = [r['source_id'], r['platform'], r['display_title'], r['author'], r['url'], ' / '.join(x['collection'] for x in r['memberships']), ' / '.join(r['themes']), r['evidence_level'], r['summary'], r['current_summary'], '자막·캡션 구간 직접 대조' if r['primary_evidence_rechecked'] else '기존 영상 분석 응답만 검토' if c else '없음', ' / '.join(str(x.get('insight','')) for x in c), ' / '.join(str(x.get('conditions','')) for x in c), ' / '.join(str(x.get('writing_prompt','')) for x in c), r['details']]
        writer.writerow(["'" + value if value.startswith(('=', '+', '-', '@')) else value for value in cells])

lines = ['# 통합 레퍼런스 목록', '', f'고유 자료 {len(data)}개. 원 목록 연결 {counts["original_membership_rows"]}건에서 동일 YouTube 영상 중복 31건을 병합했다. 원본·기존 정리·이번 선별 검토를 구분한다.', '', '[전체 읽는 순서](README.md) · [CSV](library.csv) · [JSON](library.json)', '', '아래 요약·제목은 이전 수집 작업에서 작성된 것이다. 화자의 주장·성공담·통계의 사실 검증이 아니며, 미검토 자료를 재검토 완료로 표시하지 않았다. 이번 검토 내용은 각 항목의 선별 인사이트 파일을 우선한다.', '']
for theme, _ in theme_map:
    chosen = [r for r in data if r['themes'][0] == theme]
    lines += [f'## {theme} · {len(chosen)}개', '']
    for r in chosen:
        lines += [f'<a id="{r["source_id"]}"></a>', f'### {r["source_id"]} · {r["display_title"]}'.rstrip(), '', f'[{r["platform"]} 원본]({r["url"]}) · [{r["evidence_level"]}]({r["details"]}) · {r["author"]}'.rstrip(), '', '원래 목록: ' + ' / '.join(x['collection'] for x in r['memberships']), '', '주제: ' + ' / '.join(r['themes']), '']
        if r['current_summary']:
            lines += ['**이번 선별 검토에서 정리한 출처 주장:** ' + r['current_summary'], '']
        elif r['summary']:
            lines += ['**기존 요약:** ' + r['summary'], '']
        elif r['platform'] == 'YouTube 영상':
            lines += ['**내용 미확보:** 제목·제작자·원본 링크와 접근 상태만 보존. 내용 요약과 글감 근거를 만들지 않았다.', '']
        else:
            lines += ['**현재 보존 내용:** 분석자 제목·분류·원본 링크. 원 캡션 전문은 기존 파일에 없어 제목 이상의 내용은 확정하지 않았다.', '']
        if r['source_locators']:
            lines += ['원문 참고 시점: ' + ' · '.join(f'[{x["label"]}]({x["url"]})' for x in r['source_locators']), '']
        if r['curated_insights']:
            target = 'youtube-insights.md' if r['platform'] == 'YouTube 영상' else 'instagram-insights.md'
            lines += [f'**이번 선별 검토:** [{r["source_id"]} 인사이트]({target}#{r["source_id"]}). 직접 자막·새 캡션 확인과 기존 AI 응답 검토를 구분한다.', '']
        if r['coverage_note']:
            lines += ['확인 한계: ' + r['coverage_note'], '']
lines += ['## 별첨: Threads 프로필 레퍼런스 2개', '', '작업 중 추가된 수집 결과다. 공유된 단위는 개별 게시물이 아닌 프로필이다. 아래 2개와 분류용 게시물 표본5개를 위의370개 콘텐츠 기록에 합산하지 않았다. 이번 작업에서는 추가 원문 대조 없이 기존 관찰 기록을 보존했다.', '', '[추가 수집 범위·분류 근거](sources/instagram/threads-dm-addendum.md)', '']
for r in threads['records']:
    lines += [f'<a id="{r["id"]}"></a>', f'### {r["id"]} · {r["source_brand"]}', '', f'[{r["source_account"]}]({r["source_url"]})', '', r['summary_ko'], '', '테마: ' + ' / '.join(r['themes']), '', '**활용 관계:** 운영 브랜드 후보는 미확정 제안이다. 저장·공유가 사용자의 취향이나 발행 의도를 확정하지 않는다.', '']
    for evidence in threads['supplementary_evidence']:
        if evidence['parent_id']==r['id']:
            lines += [f'- 분류용 탐색 표본 [{evidence["id"]} · {evidence["title_ko"]}]({evidence["url"]}) — 사용자가 공유한 개별 게시물로 세지 않음.']
    lines += ['']
(ROOT / 'library.md').write_text('\n'.join(lines), encoding='utf-8')
print(json.dumps(counts, ensure_ascii=False, indent=2))
