# Ruflo 적용 방안

> 상태: **권장 · 운영자 결정 전 (2026-10-01)**. 아래 내용은 모두 권장안이다. §6의 질문에 운영자가 답하기 전에는 무엇도 설치하거나 설정하지 않는다.
> 요청: 운영자 "https://github.com/ruvnet/ruflo 이거 적용 방안 ㄱㄱ" (2026-10-01)
> 관계: [에이전트 계층 방향](2026-09-24-agent-layer-direction.md)(확정 결정 ①~⑧, §3 경계 문장)과 [자동화 역할 재정렬](2026-09-26-automation-guru-realignment-design.md)을 전제로 한다. 이 문서는 두 문서를 바꾸지 않는다.
> 근거: `ruflo@3.49.0`(npm `latest` = `alpha` 태그, 2026-10-01 00:05 UTC 게시)과 의존 패키지 `@claude-flow/cli@3.49.0`. 패키지는 **실행하지 않았다**. tarball만 받아 `dist/src/init/*`·`mcp-server.js`·`commands/hive-mind.js`·`scripts/postinstall.cjs`를 읽었다.

## 1. 결론

Ruflo는 코딩 에이전트(Claude Code·Codex) **바깥을 감싸는 개발 하네스**다. Moonlight 제품(Hub·Engine·Office) 안에서 돌 수 있는 런타임이 아니다. 그래서 적용 범위는 두 갈래로 나뉜다.

| 갈래 | 권장 | 이유 |
|---|---|---|
| 제품 런타임(Hub·Engine·Office·Guru) | **넣지 않는다** | Office는 도구가 없고(확정 ①), 어느 계층도 일을 자동으로 만들거나 밖으로 보내지 않는다(§3). Ruflo가 내세우는 자율 스웜·백그라운드 워커·federation은 이 경계와 정면으로 부딪힌다. Vercel 서버리스에서 데몬·SQLite·벡터 DB를 띄울 자리도 없다 |
| 운영자 Mac의 개발 환경 | **전체 설치(`npx ruflo init`)는 하지 않는다. 플러그인 몇 개만 저장소 밖에서 시범 운영하고 측정한다** | 전체 설치는 훅 10종·전역 CLAUDE.md·모델 고정·실험 env를 함께 깐다(§2). 플러그인 경로는 저장소 파일을 바꾸지 않는다 |

요약: **"설치"가 아니라 "필요한 부품만 빌려 오고, 쓸 만한 아이디어는 Moonlight 방식으로 다시 만든다."**

## 2. 전체 설치(`npx ruflo init`)가 실제로 하는 일과 Moonlight 규칙의 충돌

코드에서 확인한 기본 동작(플래그 없이 `init` 실행 시):

| Ruflo 기본 동작 | 근거 위치(`@claude-flow/cli` dist) | 부딪히는 Moonlight 규칙 |
|---|---|---|
| `.claude/settings.json`에 훅 10종 등록 — `PreToolUse`(Bash·Edit), `PostToolUse`, `UserPromptSubmit`(작업 라우팅), `SessionStart`(기억 복원), `SessionEnd`, `Stop`(기억 동기화), `PreCompact`, `SubagentStart`, `SubagentStop`, `Notification` | `init/settings-generator.js` | 모든 프롬프트·도구 호출에 Node 프로세스가 끼어든다. 무엇이 라우팅·학습됐는지 운영자가 보지 못한다. "발동은 전부 운영자 버튼"(§3)과 결이 다르다 |
| `settings.model = 'claude-sonnet-5'` 고정, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` | 같은 파일 | 운영자가 세션마다 고르는 모델을 프로젝트 설정이 덮는다 |
| `permissions.allow`에 `Bash(npx @claude-flow*)`·`Bash(npx claude-flow*)`·`Bash(node .claude/*)`·`mcp__claude-flow__*` | 같은 파일 | `npx …@latest`를 무확인 허용한다. 2026-09-26 운영자 결정 ⑥(권한 와일드카드 축소 제안, [§6.6](2026-09-24-agent-layer-direction.md))과 반대 방향이다 |
| 기존 `CLAUDE.md`는 건너뛰지만 `--force`면 `.pre-ruflo`로 백업 후 덮어씀 | `init/executor.js` `writeClaudeMd` | CLAUDE.md·AGENTS.md는 같은 커밋으로 같이 고치는 정본이다(CLAUDE.md 머리말). 덮어쓰면 그 짝이 깨진다 |
| **전역 `~/.claude/CLAUDE.md`에 Ruflo 블록을 추가함**(`--no-global`이 있어야 막힘) | 같은 함수 | 모든 저장소의 모든 Claude Code 세션이 Ruflo 도구를 먼저 쓰라는 지시를 받는다. 저장소 범위를 넘는 변경이다 |
| `init`이 `.claude-flow/`(config.yaml·metrics·hooks·agents·workflows, 자체 `.gitignore`는 data·logs·sessions만)를 만들고, 스웜·hive-mind 실행 시 `.swarm/`·`.hive-mind/`와 SQLite 기억 저장소가 생김 | `init/executor.js`, README | 저장소 `.gitignore`는 `.claude/`·`.mcp.json`만 막는다. `.claude-flow/config.yaml`·metrics 등은 미추적 파일로 남는다. 업무 기억은 Moonlight 기록이 정본이므로 두 번째 기억 저장소가 생긴다 |
| MCP 서버 등록 — README 기준 도구 314개 | `init/mcp-generator.js`, README | moonlight MCP는 도구 10개다. 314개를 다 노출하면 맥락을 크게 차지하고 도구 선택이 흐려진다. `CLAUDE_FLOW_MCP_TOOLS`로 줄일 수 있다(`mcp-server.js`) |
| 백그라운드 워커 12종(audit·optimize·testgaps …)이 Claude Code를 **headless로 직접 호출** | `services/headless-worker-executor.js`, README | 2026-09-26에 `content-flywheel`·`chief-of-staff` 크론을 뺀 이유와 같다 — 운영자가 누르지 않은 작업이 생긴다. 비용도 운영자 모르게 쌓인다 |
| `hive-mind`가 `--dangerously-skip-permissions`로 Claude를 띄우는 경로 제공(명시 플래그일 때만) | `commands/hive-mind.js` | 메인 체크아웃은 여러 세션이 같이 쓴다(CLAUDE.md "체크아웃 하나에 세션 하나"). 권한 없는 병렬 에이전트가 같은 트리를 고치면 `git add -A` 금지 규칙도 지킬 수 없다 |
| federation(다른 기계의 에이전트와 작업 교환) | `plugin-agent-federation` 의존성 | "밖으로 보내지 않는다"(§3). 고객·매출 기록이 있는 저장소에서 외부 에이전트와 연결할 이유가 없다 |
| `postinstall`이 설치 트리의 다른 패키지(`agentdb`)의 `dist`·`package.json`을 고침, 선택 의존성에 `better-sqlite3`·`@napi-rs/keyring` 등 네이티브 모듈 | `scripts/postinstall.cjs`, `package.json` | 저장소 `package.json`에 넣으면 루트 `npm install`(워크스페이스 전체)과 CI가 함께 무거워진다. 넣지 않는다 |
| 버전 변동이 매우 빠름 — `latest`와 `alpha`가 같은 3.49.0, 오늘 게시 | npm 메타 | 문서 예시가 전부 `@latest`다. 쓴다면 반드시 버전을 고정한다 |

좋아진 점도 기록한다. 커밋 `Co-Authored-By` 추가는 이제 opt-in(`--attribution`)이고, 기존 `.mcp.json`·`CLAUDE.md`는 `--force` 없이는 덮지 않는다. `settings.json` 병합 시 훅 위험 검사(`settings-risk-scanner.js`)도 있다.

## 3. Moonlight에 이미 있는 것 (겹침 확인)

| Ruflo가 파는 것 | Moonlight 현행 | 판단 |
|---|---|---|
| 여러 에이전트 병렬 작업(swarm) | Claude Code 기본 서브에이전트, 작업별 `git worktree`(2026-07-16 확정), 2.1 결정 "서브에이전트 동원 가능" | 이미 있다. 스웜이 주는 추가 가치는 "합의·토폴로지"인데, 1인 운영 저장소에는 과하다 |
| 세션 간 기억 | CLAUDE.md·AGENTS.md·`docs/README.md` 상태표·스펙 문서(사람이 읽는 정본) | 벡터 기억은 "왜 그렇게 정했나"를 숨긴다. 결정은 문서에 남기는 현행 방식을 유지한다 |
| 스킬·방법론(SPARC 등) | gstack 스킬 라우팅(office-hours·investigate·ship·review…), superpowers 스펙 흐름, `.agents/skills/` | 이미 있다. 방법론을 하나 더 얹으면 라우팅이 충돌한다 |
| 실행 기록 | moonlight MCP `skill-requests`·receipt, 클라이언트별 actor 토큰(2026-09-26) | Moonlight 쪽이 업무와 직접 이어진다 |
| 비용 추적 | **없음** — 계층 방향 §7 미정 "월별 AI 비용 표시" | **빈 곳**. 아래 §4 B-1 |
| 에이전트 설정 보안 점검 | **절반** — 권한 축소 제안 파일이 운영자 적용 대기(§6.6 #6) | **빈 곳**. 아래 §4 A-2 |
| 테스트 빈틈 찾기 | `npm test` 3120건, 가드 테스트 다수 | 생성은 필요 없고, "빈틈 목록"만 참고할 가치가 있다 |

## 4. 권장안 — 3단계

### 단계 A. 설치 없이 아이디어만 가져오기 (지금 가능, 위험 0)

1. **A-1 훅 한 개만 직접 만든다.** Ruflo의 `PreToolUse(Bash)` 검사 아이디어를 빌려, 저장소 규칙을 기계적으로 막는 훅 하나를 `.claude/settings.json`(gitignore 대상이므로 운영자 Mac 로컬)에 둔다. 막을 것: `git add -A`·`git commit -a`·`git push --force`·`npm run db:migrate`(대상 ref 없이). CLAUDE.md에 이미 적힌 금지를 문장에서 장치로 옮기는 것이다. 학습·라우팅 훅은 넣지 않는다.
2. **A-2 권한 점검 기준을 빌린다.** `settings-risk-scanner.js`가 보는 항목(와일드카드 Bash, 원격 스크립트 실행, 비밀 파일 읽기)을 §6.6 #6 제안 파일과 대조해 빠진 항목만 제안에 더한다. 적용은 여전히 운영자 몫이다.

### 단계 B. 플러그인 2~3개 저장소 밖 시범 (운영자 승인 후, 2주)

플러그인 경로(`/plugin marketplace add ruvnet/ruflo`)는 작업 폴더에 파일을 만들지 않는다. 사용자 범위로만 깔린다.

| 후보 | 쓰임 | 조건 |
|---|---|---|
| **B-1 `ruflo-cost-tracker`** | 개발 세션 토큰·비용 관찰 → 계층 방향 §7 "월별 AI 비용" 설계 입력 | 측정 수치만 본다. 예산 알림이 업무를 만들지 않게 한다 |
| **B-2 `ruflo-jujutsu`** | diff 위험 점수·리뷰어 제안 | `/review`·`code-review`와 같은 PR에 돌려 겹침을 비교한다 |
| **B-3 `ruflo-security-audit`** 또는 `ruflo-metaharness` | 의존성 CVE·에이전트 설정 점검 | 읽기 전용 실행만. 자동 "remediation"은 끈다 |

시범 규칙:
- **`ruflo-core`는 MCP 서버를 함께 등록한다.** 깔 경우 `CLAUDE_FLOW_MCP_TOOLS`로 시범 플러그인 범주만 열고, `claude mcp list`로 노출 도구 수를 기록한다.
- 버전 고정(예: `ruflo@3.49.0`). `@latest` 금지.
- `.env*`·`apps/*/.env.production.local`·`~/.moonlight/mcp/*.env`를 읽지 않는지 첫날 확인한다(Ruflo 기본 deny는 루트 `.env`, `.env.*`뿐이라 앱 하위 env는 막지 않는다).
- 메인 체크아웃이 아니라 전용 worktree에서만 쓴다.
- 제외(설치하지 않음): `ruflo-autopilot`, `ruflo-loop-workers`, `ruflo-federation`, `ruflo-swarm`/hive-mind, `ruflo-agent`(클라우드 Managed Agents), `ruflo-intelligence`/`ruflo-daa`(자가 학습), `ruflo-testgen`(자동 생성), 거래·IoT 플러그인.

성공 기준(2주 뒤 운영자가 판단):
- B-1: 세션별 비용이 Claude Code 기본 `/cost`보다 운영 판단에 더 쓸모 있었나.
- B-2: 위험 점수가 실제 버그를 1건이라도 먼저 짚었나, 아니면 기존 리뷰와 같은 말만 했나.
- B-3: 새로 찾은 실제 문제 수, 오탐 수.
- 공통: 세션 응답 지연, 맥락 사용량, 설정 파일 변경 여부(없어야 한다).

되돌리기: `/plugin uninstall <이름>` → `claude mcp list`에서 ruflo 항목 제거 확인 → `~/.claude/CLAUDE.md`에 Ruflo 블록이 없는지 확인.

### 단계 C. 전체 설치 — 권장하지 않음

다음 중 하나라도 운영자가 원할 때만 다시 검토한다. 그 경우에도 별도 샌드박스 저장소에서 `npx ruflo@<고정버전> init --minimal --no-global`로 먼저 본다.
- 여러 저장소를 동시에 고치는 장시간 무인 작업이 실제로 필요해졌다.
- 단계 B에서 플러그인 하나가 분명한 가치를 보였고, 그 기능이 CLI 전체 설치에서만 동작한다.

## 5. 일정과 OKR

OKR v3 확정 12에 따라 10월은 Moonlight 제품 개발 동결 기간이다. 이 방안은 제품 코드를 바꾸지 않는 개발 도구 시범이므로 동결과 직접 충돌하지 않는다. 다만 시범이 새 기능 작업의 핑계가 되지 않도록, 단계 B는 "쓰기·고치기" 세션에만 붙인다.

## 6. 운영자 결정이 필요한 것

1. 범위: 단계 A만 / A + B 시범 / 지금은 보류 — 권장 **A + B**.
2. 단계 B 후보: B-1·B-2·B-3 중 무엇을 깔지 — 권장 **B-1 + B-2**(B-3는 `npm audit`과 겹칠 수 있음).
3. A-1 훅의 금지 목록을 위 4개로 할지, 더할 것이 있는지.
4. 시범 기간 비용 상한(개발 세션). 현재 리서치 자동 준비는 상한 없이 관찰 중이다(2026-10-01) — 같은 방식으로 둘지.
5. 제품 런타임 미적용(§1)을 확정으로 기록할지.

## 7. 확인하지 않은 것

- 패키지를 실행하지 않았으므로 플러그인별 실제 파일 쓰기·네트워크 호출은 시범 첫날 확인해야 한다.
- README의 성능 수치(벡터 검색 속도)와 "314 도구"는 프로젝트 자체 주장이며 재현하지 않았다.
- Codex 쪽(`@claude-flow/codex`)은 AGENTS.md 생성기를 갖고 있다. Codex에 적용할 때도 기존 AGENTS.md를 덮지 않도록 같은 원칙을 따른다.
