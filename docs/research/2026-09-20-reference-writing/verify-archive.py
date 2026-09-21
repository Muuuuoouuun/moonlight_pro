"""Validate preserved research without network or historical local originals.

Python 3.9+. Use --standalone when only this folder, not the repository, is present.
"""
import argparse
import csv
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
GENERATED = ('library.json', 'library.csv', 'library.md', 'coverage.json')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(name):
    return json.loads((ROOT / name).read_text(encoding='utf-8'))


def check_target(target, source, anchor=''):
    require(target.is_file(), f'Missing local link: {source} -> {target}')
    if not anchor:
        return
    text = target.read_text(encoding='utf-8')
    if re.fullmatch(r'L\d+', anchor):
        require(0 < int(anchor[1:]) <= len(text.splitlines()), f'Invalid line: {source} -> {target}#{anchor}')
    else:
        require(f'id="{anchor}"' in text or f"id='{anchor}'" in text,
                f'Missing explicit anchor: {source} -> {target}#{anchor}')


def check_json_locations(value, key=''):
    if isinstance(value, dict):
        for child_key, child in value.items():
            check_json_locations(child, child_key)
    elif isinstance(value, list):
        for child in value:
            check_json_locations(child, key)
    elif isinstance(value, str) and value.startswith('/'):
        require(key == 'original_location_at_review', f'Active absolute JSON path in {key}: {value}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--standalone', action='store_true', help='Skip links to repository files outside this archive.')
    args = parser.parse_args()
    messages = []

    manifest = read_json('source-manifest.json')['files']
    require(len(manifest) == 17, 'Expected 17 preserved source snapshots')
    snapshots = set()
    for entry in manifest:
        path = (ROOT / entry['preserved_path']).resolve()
        require(path.is_relative_to(ROOT / 'sources'), 'Snapshot escaped sources/')
        require(path not in snapshots, 'Duplicate snapshot manifest entry')
        snapshots.add(path)
        content = path.read_bytes()
        require(len(content) == entry['bytes'], f'Snapshot size changed: {entry["preserved_path"]}')
        require(hashlib.sha256(content).hexdigest() == entry['sha256'], f'Snapshot hash changed: {entry["preserved_path"]}')
        require('original_location_at_review' in entry, 'Missing historical location label')
    require(snapshots == {p.resolve() for p in (ROOT / 'sources').rglob('*') if p.is_file()}, 'Unlisted or missing source snapshot')
    messages.append('PASS: 17 preserved snapshots match internal SHA-256 and size; historical files not accessed')

    library = read_json('library.json')
    records = library['records']
    counts = library['counts']
    require(counts == read_json('coverage.json'), 'Coverage and library counts differ')
    require(len(records) == len({r['id'] for r in records}) == 370, 'Unique content count must be 370')
    require(len({r['source_id'] for r in records}) == 370, 'Source IDs must be unique')
    require(dict(Counter(r['platform'] for r in records)) == {
        'YouTube 영상': 265, 'Instagram': 103, 'Facebook': 1, 'YouTube 커뮤니티': 1,
    }, 'Platform counts differ')
    require(sum(len(r['memberships']) for r in records) == 401, 'Expected 401 original memberships')
    require(counts['original_membership_rows'] == 401 and counts['duplicate_membership_rows'] == 31, 'Membership counts differ')
    required_record = {'id', 'source_id', 'platform', 'title', 'author', 'url', 'memberships', 'tags', 'themes',
                       'evidence_level', 'analysis_basis', 'summary', 'summary_origin', 'details', 'fact_check',
                       'curated_insights', 'curated_in_this_run', 'primary_evidence_rechecked', 'current_summary', 'display_title'}
    for r in records:
        require(required_record <= r.keys(), f'Missing record fields: {r["id"]}')
        parsed = urlparse(r['url'])
        require(parsed.scheme in ('http', 'https') and parsed.netloc and not parsed.username, f'Invalid source URL: {r["id"]}')
        path, _, anchor = r['details'].partition('#')
        check_target((ROOT / unquote(path)).resolve(), r['id'], unquote(anchor))
    messages.append('PASS: 370 unique content records, 401 memberships, 31 duplicate YouTube memberships; source links valid')

    by_source = {r['source_id']: r for r in records}
    yt = read_json('sources/youtube/coverage.json')['records']
    memberships = defaultdict(list)
    for original in yt:
        sid = original['video_id']
        r = by_source[sid]
        # The original normalizer selected metadata from the first playlist row.
        # Other row-specific tags remain intact in the hashed source snapshot.
        if not memberships[sid]:
            require(all(r[k] == original[v] for k, v in [('title', 'title'), ('author', 'channel'), ('url', 'url'),
                        ('tags', 'tags'), ('evidence_level', 'status'), ('analysis_basis', 'analysis_basis'),
                        ('transcript_collected_previously', 'transcript_collected')]), f'YouTube source fields changed: {sid}')
        memberships[sid].append({'collection': original['playlist'], 'order': original['order']})
    require(len(yt) == 296 and len(memberships) == 265, 'YouTube source coverage differs')
    for sid, links in memberships.items():
        require(by_source[sid]['memberships'] == links, f'Lost YouTube playlist membership: {sid}')
    require(sum(bool(by_source[sid]['summary']) for sid in memberships) == 264, 'Expected 264 YouTube summaries')
    for r in records:
        if r['platform'] == 'YouTube 영상' and r['evidence_level'] == '내용 미확보':
            require(not r['summary'] and not r['curated_insights'], 'Unavailable video must not become a summary')

    saved = read_json('sources/instagram/saved-records.json')['records']
    require(len(saved) == 85, 'Expected 85 saved Instagram records')
    for original in saved:
        r = by_source[original['id']]
        require(r['id'] == 'ig:' + original['shortcode'], 'Instagram post identity changed')
        require(all(r[k] == original[v] for k, v in [('title', 'analysis_title'), ('author', 'author'), ('url', 'url'),
                    ('analysis_basis', 'analysis_scope'), ('previous_confidence', 'confidence'), ('previous_review_state', 'review_state')]),
                f'Saved Instagram source fields changed: {original["id"]}')
        require(not r['summary'], 'Old saved titles must not become invented summaries')

    dm = read_json('sources/instagram/dm-records.json')['records']
    require(len(dm) == 20, 'Expected 20 DM references')
    for original in dm:
        r = by_source[original['id']]
        require(r['url'] == (original.get('observed_author_permalink') or original['observed_url']), 'DM source link changed')
        require(r['author'] == original['author'] and r['summary'] == original['content_summary'], 'DM source content changed')
        require(r['analysis_basis'] == original['evidence'], 'DM evidence label changed')

    threads = read_json('sources/instagram/threads-dm-records.json')
    require(library['supplementary_profiles'] == threads['records'] and len(threads['records']) == 2, 'Threads profiles changed')
    require(library['profile_discovery_evidence'] == threads['supplementary_evidence'] and len(threads['supplementary_evidence']) == 5,
            'Threads discovery sample changed')
    require(counts['supplementary_profile_references'] == 2 and counts['supplementary_profile_discovery_posts'] == 5,
            'Threads supplemental counts differ')
    messages.append('PASS: source-specific fields and memberships retained; 264 video summaries; Threads 2 profiles / 5 discovery posts separate')

    insights_by_source = {}
    for name, expected in [('youtube-insights', 14), ('instagram-insights', 12)]:
        insights = read_json(name + '.json')
        require(len(insights) == len({r['source_id'] for r in insights}) == expected, f'{name} count differs')
        required = {'source_id', 'title', 'url', 'locator', 'evidence_level', 'observed_claim', 'insight', 'conditions', 'writing_prompt', 'verification'}
        doc = (ROOT / (name + '.md')).read_text(encoding='utf-8')
        for item in insights:
            require(required <= item.keys(), f'Missing insight fields: {item.get("source_id")}')
            sid = item['source_id']
            require(sid in by_source and by_source[sid]['curated_insights'] == [item], f'Unlinked insight: {sid}')
            require(f'<a id="{sid}"></a>' in doc and item['observed_claim'] in doc, f'Insight Markdown mismatch: {sid}')
            insights_by_source[sid] = item
    require(sum(r['curated_in_this_run'] for r in records) == counts['curated_source_count'] == 26, 'Expected 26 curated sources')
    require(sum(r['primary_evidence_rechecked'] for r in records) == counts['primary_content_rechecked'] == 22, 'Expected 22 primary content rechecks')
    require(sum(r['curated_in_this_run'] and not r['primary_evidence_rechecked'] for r in records) == counts['prior_analysis_reviewed_only'] == 4,
            'Expected 4 prior-analysis-only reviews')
    evidence = read_json('evidence-manifest.json')['records']
    require(len(evidence) == 14 and {r['source_id'] for r in evidence} == {r['source_id'] for r in read_json('youtube-insights.json')},
            'Historical evidence manifest coverage differs')
    for item in evidence:
        original = insights_by_source[item['source_id']]
        require(item['source_url'] == original['url'] and item['locator'] == original['locator'], 'Historical evidence source mismatch')
        require(item['original_location_at_review'] == original['verification']['original_location_at_review'], 'Historical evidence location mismatch')
        require(re.fullmatch(r'[0-9a-f]{64}', item['sha256']) and item['bytes'] > 0, 'Malformed historical evidence fingerprint')
    messages.append('PASS: 26 curated / 22 primary-content rechecks / 4 prior-analysis-only; 14 historical fingerprints consistent (originals not reopened)')

    with (ROOT / 'library.csv').open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.reader(stream))
    require(len(rows) == 371 and all(len(row) == 15 for row in rows), 'CSV must have header + 370 rows, 15 columns')
    require(all(not value.startswith(('=', '+', '-', '@')) for row in rows for value in row), 'Unprotected CSV formula prefix')
    require([row[0].lstrip("'") for row in rows[1:]] == [r['source_id'] for r in records], 'CSV source ordering mismatch')
    require([row[2] for row in rows[1:]] == [r['display_title'] for r in records], 'CSV display titles mismatch')
    kit = (ROOT / 'writing-kit.md').read_text(encoding='utf-8')
    require(len(re.findall(r'^### [1-6]\. ', kit, re.M)) == 6 and len(re.findall(r'^### 초안 [ABC] ', kit, re.M)) == 3, 'Writing kit structure differs')
    require('소재함에 넣을 수 있는 카드 예시' in kit and '부서별 도구 묶음' not in kit, 'Writing card or corrected source label missing')
    messages.append('PASS: CSV 370 rows / 15 columns / formula prefix protection; 6 writing topics / 3 drafts / 1 source card')

    checked_links = skipped_snapshots = skipped_repo = 0
    for path in sorted(ROOT.rglob('*.md')):
        text = path.read_text(encoding='utf-8')
        for target_text in re.findall(r'\[[^\]\n]*\]\(([^)\n]+)\)', text):
            target_text = target_text.strip('<>')
            if urlparse(target_text).scheme in ('http', 'https', 'mailto'):
                continue
            raw_path, _, anchor = target_text.partition('#')
            raw_path, anchor = unquote(raw_path), unquote(anchor)
            target = (path.parent / raw_path).resolve() if raw_path else path
            if path in snapshots and (Path(raw_path).is_absolute() or target not in snapshots):
                skipped_snapshots += 1
                continue
            require(not Path(raw_path).is_absolute(), f'Nonportable Markdown link: {path.name} -> {raw_path}')
            require(not re.search(r':\d+$', raw_path), f'Use #L for line links: {raw_path}')
            if args.standalone and not target.is_relative_to(ROOT):
                skipped_repo += 1
                continue
            check_target(target, path.relative_to(ROOT), anchor)
            checked_links += 1
    for path in ROOT.glob('*.json'):
        check_json_locations(json.loads(path.read_text(encoding='utf-8')))
    messages.append(f'PASS: {checked_links} local Markdown links / explicit anchors / line references; historical snapshot links excluded: {skipped_snapshots}; repository links excluded: {skipped_repo}')

    # Rebuild with only archived inputs and forbid reads outside the isolated copy
    # and Python's own runtime. Historical paths cannot silently become inputs.
    runner = '''import csv, hashlib, json, re, runpy, sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse
base = Path(sys.argv[1]).resolve()
allowed = [base, Path(sys.base_prefix).resolve(), Path(sys.prefix).resolve()]
def guard(event, args):
    if event == "open" and isinstance(args[0], (str, bytes)):
        path = Path(args[0].decode() if isinstance(args[0], bytes) else args[0]).resolve()
        if not any(path.is_relative_to(root) for root in allowed):
            raise PermissionError("Read outside archived inputs: " + str(path))
    if event.startswith("socket."):
        raise PermissionError("Network is outside archive regeneration")
sys.addaudithook(guard)
runpy.run_path(str(base / "build-library.py"), run_name="__main__")
'''
    with tempfile.TemporaryDirectory(prefix='.archive-check-', dir=ROOT) as temp:
        isolated = Path(temp)
        for name in ('build-library.py', 'source-manifest.json', 'youtube-insights.json', 'instagram-insights.json'):
            shutil.copyfile(ROOT / name, isolated / name)
        shutil.copytree(ROOT / 'sources', isolated / 'sources')
        command = [sys.executable, '-I', '-B', '-c', runner, str(isolated)]
        result = subprocess.run(command, cwd=isolated, capture_output=True, text=True)
        require(result.returncode == 0, 'Isolated regeneration failed: ' + result.stderr)
        for name in GENERATED:
            require((ROOT / name).read_bytes() == (isolated / name).read_bytes(), f'Generated output differs: {name}; run build-library.py')
        damaged = isolated / manifest[0]['preserved_path']
        damaged.write_bytes(damaged.read_bytes() + b'\n')
        rejected = subprocess.run(command, cwd=isolated, capture_output=True, text=True)
        require(rejected.returncode != 0 and 'Preserved snapshot changed' in rejected.stderr, 'Builder did not reject changed snapshot')
    messages.append('PASS: isolated offline regeneration matches all 4 outputs byte-for-byte; altered snapshot rejected')
    print('\n'.join(messages))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError) as error:
        print('FAIL: ' + str(error), file=sys.stderr)
        sys.exit(1)
