# Claude Code Skills 설치·관리 가이드

> 이 문서의 목적: "깃허브에서 본 skill 어떻게 추가하지?"에 대한 단일 참조. 이 질문이 반복될 때마다 이 파일을 열면 끝나게 만들기.

**마지막 검증**: 2026-04-12 (공식 문서 기준)

---

## 0. TL;DR

Skill은 **프롬프트 덩어리를 파일로 저장해둔 것**. Claude가 필요할 때 자동으로 꺼내 쓰거나, 네가 `/skill-name`으로 직접 부를 수 있음.

설치는 단 3단계:
1. GitHub에서 skill 폴더 다운로드/클론
2. 아래 세 경로 중 하나에 복사 (`SKILL.md`가 들어 있는 폴더 통째로)
3. 끝 — Claude Code 재시작 불필요

```bash
# 개인 (전역, 모든 프로젝트에서 사용)
~/.claude/skills/<skill-name>/SKILL.md

# 프로젝트 전용
<project>/.claude/skills/<skill-name>/SKILL.md
```

---

## 1. Skill이 사는 세 레이어

Claude Code가 skill을 찾는 **우선순위** (높은 → 낮은):

| 레이어 | 위치 | 범위 | 언제 쓰나 |
|---|---|---|---|
| **Enterprise** | managed settings | 조직 전역 | 회사에서 강제 배포 (개인은 안 씀) |
| **Personal** | `~/.claude/skills/<name>/SKILL.md` | 내 모든 프로젝트 | 내가 매번 쓰는 개인 플레이북 |
| **Project** | `<repo>/.claude/skills/<name>/SKILL.md` | 이 프로젝트만 | 팀 공유 or 프로젝트 특화 규칙 |
| **Plugin** | `<plugin>/skills/<name>/SKILL.md` | plugin이 활성화된 곳 | `/plugin`으로 받은 번들 |
| **Nested project** | `packages/*/.claude/skills/` | 해당 하위 디렉토리 | 모노레포 패키지별 규칙 |

**이름 충돌**: 우선순위 높은 쪽이 이김. Plugin은 항상 `/<plugin>:<skill>` 네임스페이스라서 개인/프로젝트 skill과 절대 충돌하지 않음.

**현재 이 프로젝트의 상태**:
- Personal: `~/.claude/skills/` 에 44개 (autoplan, codex, checkpoint, design-consultation 등)
- Project: `.claude/skills/ui-ux-pro-max` 1개
- Plugin: `frontend-design` (세션에서 `/plugin` 설치)

---

## 2. Skill 최소 구조

필수는 **딱 하나**: `SKILL.md`.

```
my-skill/
└── SKILL.md      ← 필수. 이것만 있어도 동작.
```

보조 파일을 곁들이는 구조 (선택):

```
my-skill/
├── SKILL.md           ← 진입점 (항상 로드)
├── reference.md       ← 상세 문서 (SKILL.md에서 참조)
├── examples.md        ← 사용 예
└── scripts/
    └── validate.sh    ← Claude가 실행 가능한 스크립트
```

### SKILL.md 프론트매터 레퍼런스

```yaml
---
name: explain-code               # 소문자, 숫자, 하이픈만. 최대 64자. 생략 시 폴더명.
description: 코드를 다이어그램과 비유로 설명  # 언제 쓰는 skill인지. 250자 내. Claude가 이걸 보고 자동 발동 여부 판단.
disable-model-invocation: false  # true면 Claude가 자동으로 못 씀. /name으로만 수동 호출.
user-invocable: true             # false면 / 메뉴에 안 보임 (백그라운드 지식용).
allowed-tools: "Read Edit Bash"  # 이 skill 활성 시 허가 없이 쓸 수 있는 도구들.
context: fork                    # fork면 isolated subagent context에서 실행.
paths:                           # glob 패턴. 이 파일 편집 중일 때만 자동 활성화.
  - "**/*.tsx"
  - "**/*.ts"
---

# Skill 본문 (마크다운)
여기서부터 Claude에게 줄 지침. 체크리스트, 금지 사항, 예제 등.
```

**최소 예시** — 이것만 있어도 작동:

```yaml
---
name: korean-commit
description: 한글로 간결한 커밋 메시지 작성
---

커밋 메시지는:
1. 첫 줄은 동사로 시작 (추가, 수정, 제거)
2. 50자 내
3. 본문은 "왜"에 집중, "무엇"은 diff로 충분
```

---

## 3. GitHub에서 Skill 설치하는 3가지 방법

### 방법 A — 수동 복사 (가장 단순, 추천)

**시나리오**: `github.com/anthropics/skills` 에서 `frontend-design` skill 하나만 가져오고 싶다.

```bash
# 1. 리포 클론 (임시 위치)
cd /tmp
git clone https://github.com/anthropics/skills.git

# 2. 원하는 skill 폴더만 복사
# Personal로 (전역)
cp -r /tmp/skills/frontend-design ~/.claude/skills/

# 또는 Project로 (이 프로젝트만)
cp -r /tmp/skills/frontend-design /Users/bigmac_moon/Desktop/Projects/moonlight_pro/.claude/skills/

# 3. 임시 클론 삭제
rm -rf /tmp/skills
```

**주의**:
- 리포 전체를 `.claude/skills/`에 넣지 말 것. skill 폴더 하나씩 들고 오기.
- `SKILL.md`가 들어 있는 폴더가 skill 단위. 그 상위 폴더 이름이 `/skill-name`이 됨.

### 방법 B — 단일 파일 skill (가장 빠름)

프론트매터 있는 `SKILL.md` 하나만 있으면 그 자리에서 직접 작성 가능. GitHub에서 파일 내용을 복사해서 로컬에서 바로 만들면 됨:

```bash
mkdir -p ~/.claude/skills/my-new-skill
# SKILL.md 내용을 붙여넣기
pbpaste > ~/.claude/skills/my-new-skill/SKILL.md
```

### 방법 C — Plugin 설치 (버전 관리/공유용)

Plugin은 **skill + agent + hook + MCP 서버**를 한 패키지로 묶은 것. Marketplace를 통해 설치.

```bash
# Claude Code 안에서
/plugin install <plugin-name>
```

이 세션에서 `frontend-design`을 이렇게 설치했고, 그래서 `Skill` 목록에 `frontend-design:frontend-design` 형태로 네임스페이스 prefix가 붙어서 나타남.

**언제 plugin을 선택하나**:
- 팀·커뮤니티에 배포할 때
- 버전 관리가 필요할 때 (`0.1.0 → 0.2.0` 식 릴리스)
- skill 여러 개 + hook까지 함께 묶을 때

---

## 4. 설치 확인

**Claude Code 안에서**:
- `/` 타이핑 → skill 이름이 메뉴에 뜨는지 확인
- 또는 `"무슨 skill이 있어?"` 물어보기

**파일로 직접 확인**:
```bash
ls ~/.claude/skills/
ls <project>/.claude/skills/
```

**재시작 불필요**: Claude Code는 새 skill을 자동 감지. 편집도 live-reload.

---

## 5. Skill vs Plugin vs Subagent — 셋 중 뭘 쓰나

| | **Skill** | **Plugin** | **Subagent** |
|---|---|---|---|
| **정체** | 프롬프트 파일 묶음 | skill/agent/hook/MCP 번들 | 독립 context의 AI 워커 |
| **호출** | `/skill-name` 또는 Claude 자동 | `/plugin:skill` 네임스페이스 | Claude가 Task 툴로 위임 |
| **공유** | 폴더 복사 | marketplace 설치, 버전 관리 | `.claude/agents/` 파일 |
| **context** | 인라인 (메인 대화에 로드) 또는 forked | skill 각각의 규칙 따름 | 항상 독립 context |
| **주된 용도** | 반복 플레이북, 체크리스트, 절차 | skill 묶음 배포 | 연구·로그 분석·병렬 작업 위임 |

**실용 규칙**:
- 매번 같은 체크리스트/규칙을 대화에 붙여넣고 있다 → **Skill**
- 여러 개 skill + 설정을 팀에 배포하고 싶다 → **Plugin**
- 작업이 메인 context를 오염시킬 정도로 크다 → **Subagent**

---

## 6. 함정들 (gotchas)

- **파일명은 `SKILL.md`** 대소문자 정확히. `Skill.md`·`skill.md` 안 됨.
- **폴더명이 skill 이름**: 프론트매터의 `name`을 생략하면 폴더명이 그대로 이름이 됨. 소문자·하이픈만 쓰기.
- **description은 앞쪽에 핵심 용도를 쓰기**: Claude는 description을 보고 auto-invoke 여부를 결정. 250자 초과하면 목록에서 잘림.
- **본문은 호출 시점에만 로드**: SKILL.md 본문 자체는 기본적으로 context에 안 올라감. description만 항상 보임. 덕분에 긴 레퍼런스 skill을 만들어도 비용이 적음.
- **긴 대화 후 auto-compaction**에서 오래된 skill이 잘려나갈 수 있음. 필요하면 재호출.
- **Plugin skill은 네임스페이스**: `frontend-design:frontend-design` 같은 prefix. 개인/프로젝트 skill과 이름 충돌 걱정 X.

---

## 7. 공식·커뮤니티 소스 (2026-04 기준 검증)

### 공식
- **[`anthropics/skills`](https://github.com/anthropics/skills)** — 앤트로픽 공식. 현재 17개 skill: `claude-api`, `frontend-design`, `mcp-builder`, `pdf`, `skill-creator`, `webapp-testing`, `brand-guidelines` 등.
  - 가장 안전한 첫 소스. 여기서 필요한 것만 골라 복사.

### 커뮤니티
- [`alirezarezvani/claude-skills`](https://github.com/alirezarezvani/claude-skills) — 232개+ 커뮤니티 skill
- [`travisvn/awesome-claude-skills`](https://github.com/travisvn/awesome-claude-skills) — 큐레이션 리스트
- [`daymade/claude-code-skills`](https://github.com/daymade/claude-code-skills) — 마켓플레이스 스타일
- [`agentskill.sh`](https://agentskill.sh) — 브라우저 UI로 검색 설치

**커뮤니티 skill 설치 원칙**: `SKILL.md` 본문을 먼저 읽고, 이 skill이 어떤 도구 권한을 요구하는지(`allowed-tools`)와 어떤 파일을 건드릴지 확인한 뒤 복사. 특히 `Bash`가 허용된 skill은 임의 명령 실행 가능.

---

## 8. 이 프로젝트에 skill 추가하기 — 결정 체크리스트

새 skill이 생길 때:

```
그 skill은 나만 쓰나?                        → Personal (~/.claude/skills/)
        ↓ 아니오
이 프로젝트에서만 쓰나?                       → Project (.claude/skills/)
        ↓ 아니오
팀/커뮤니티에 버전 관리하며 배포할 건가?        → Plugin (`/plugin`)
        ↓ 아니오
여러 프로젝트에서 같은 사본 써도 상관없나?     → Personal (가장 단순)
```

대부분 질문의 답: **Personal** (`~/.claude/skills/`) — 빠르고 전역이고 간섭 없음. 프로젝트 특화 규칙만 Project 레이어로 넣자.

---

## 9. 공식 문서 링크

- [Skills](https://code.claude.com/docs/en/skills.md)
- [Plugins](https://code.claude.com/docs/en/plugins.md)
- [Subagents](https://code.claude.com/docs/en/sub-agents.md)
- [`anthropics/skills` GitHub](https://github.com/anthropics/skills)
