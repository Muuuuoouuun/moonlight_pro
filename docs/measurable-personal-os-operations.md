# 측정 가능한 Personal OS — 운영·연결 가이드

2026-09-21 구현 기준. 설계 범위는 [실행 계획](superpowers/plans/2026-09-21-measurable-personal-os.md), 전체 MCP 계약은 [MCP README](../packages/mcp-server/README.md)를 따른다.

## 업무 흐름

1. Hub 목표 화면에서 개인/회사 목표, 기간, 지표 정의와 출처를 설정한다. 할 일·프로젝트·콘텐츠 상세에서 같은 범위의 목표를 연결한다. 연결 자체는 성과가 아니다.
2. `get_work_context`로 저장된 원문·정확한 수정 시각·범위·연결 목표를 읽는다. 콘텐츠 문맥은 저장된 아이디어/요약이며, Studio의 미저장 편집이나 채널 변형 본문은 포함하지 않는다.
3. Codex·Claude·Antigravity 대화에서 초안/수정/비평/분석 후 `save_ai_candidate`로 후보를 저장한다. 이 경로는 Moonlight의 Gemini API를 호출하지 않으며, 모델·클라이언트 출처는 사용자가 보고한 정보로 기록된다. 또는 `request_ai_assist`로 Engine의 Gemini API를 한 번 호출한다.
4. 사람이 검토한 뒤 `record_assist_outcome`으로 accepted/edited/rejected와 시간을 기록한다. 후보 저장·채택은 원문 적용, 발행, 전송, 작업 완료와 별개다. Studio의 기존 적용·복원 흐름은 별도로 남아 있다.
5. `get_weekly_report`의 최근 **완료된 7개 현지 날짜**를 확인하고 `get_goals`로 목표 상세를 조회한다. 자동 지표는 완료 시각·실제 연락·성공 발행·하루 리뷰 원장을 사용하며 실패·근거 부족은 `null`/partial/unmeasured로 남는다. 계약액은 입금액이 아니다.

시간 차이 = baselineMinutes − reviewMinutes − actualMinutes. actualMinutes는 프롬프트 작성·실행·재작업을 포함하고 검토 시간을 제외한다. 세 값 중 하나라도 없으면 시간 차이는 미측정이다. 설치·유지보수 시간은 포함하지 않으므로 전체 시스템의 순절감으로 해석하지 않는다. 토큰은 공급자가 보고한 수치만 저장하고 누락은 null이다. 통화 비용 계산과 계정 전체 지출 제한은 구현하지 않았다.

## 빠른 입력과 확인

- `현황 → 목표·성과 → 빠른 체크` 또는 `⌘/Ctrl+K`에서 **목표 빠른 체크**를 검색해 들어간다. 팔레트는 현재 개인·회사·전체 범위를 유지한다. 목표 생성·상세 왕복과 범위 전환에도 빠른 체크 보기를 유지한다.
- 목표 화면의 **빠른 체크**는 지표별 현재값·목표값과 근거 상태를 모아 보여준다. 지표 이름으로 검색하고 직접 기록할 지표나 미측정·부분 측정 지표만 좁힐 수 있다. 직접 측정 지표는 목록에서 바로 기록하고, 자동 집계 지표는 근거를 확인한다. 조회 실패·한도와 정상 빈 목록은 구분한다.
- 새 목표의 기간은 이번 주·이번 달·이번 분기로 선택할 수 있다. 목표·지표·관측 입력은 `⌘/Ctrl+Enter`로 저장한다. 필수 값 검증과 저장 충돌 확인은 단축키에도 동일하게 적용한다.
- 관측 입력은 실제값에 바로 포커스하며 날짜·메모는 펼쳐 수정한다. 최근 근거를 불러오면 이름·주소와 실제 발생 일시를 함께 유지한다. 관측 일시와 근거 일시는 접힌 상태에서도 표시하고, 값 자체는 복사하거나 합산하지 않는다.
- 상단 **빠른 입력** 버튼과 전역 `C`는 같은 입력 창을 연다. 닫으면 원래 버튼으로 키보드 포커스가 돌아온다. 빠른 입력은 `Esc`로 닫았다 다시 열어도 작성 중인 내용·유형·요청 번호를 유지한다. 앱 셸이 유지되는 동안의 보관이며 새로고침 이후 보존을 보장하지 않는다. 저장 중에는 닫기와 중복 제출을 막고, 응답을 20초 안에 확인하지 못하면 입력을 유지한 채 다시 시도하거나 닫을 수 있다. 재시도의 정규화된 내용·유형이 같으면 요청 번호를 재사용한다. 성공 뒤 입력에 포커스를 돌려준다. 내 작업에서 저장을 기다리며 다음 항목을 입력해도 새 입력이 지워지지 않는다. 체크박스의 `Space`는 행의 상세 열기와 분리된다.
- AI 후보의 **채택 기록 / 수정 후 채택 / 폐기 기록**은 기존 시간·메모를 유지해 빠르게 평가한다. 시간·메모는 필요할 때 따로 입력하며 작성 중인 내용도 보존한다. **후보 복사**는 전체 본문을 확인해 복사한다. 검토 기록은 원문 적용·발행·업무 완료를 뜻하지 않는다.

## 서버 준비

저장소 루트에서 `npm install` 후 Hub와 Engine을 각각 `npm run dev:hub`, `npm run dev:engine`으로 실행한다. Node 22 이상과 절대 경로를 사용한다. 아래는 설정 템플릿이며 실제 키는 커밋하지 않는다.

Hub의 비공개 `apps/hub/.env.local`:

```dotenv
SUPABASE_URL=<intended-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
COM_MOON_DEFAULT_WORKSPACE_ID=<existing-workspace-uuid>
COM_MOON_AGENT_API_TOKEN=<distinct-random-agent-token>
COM_MOON_AGENT_ACTOR_ID=operator-mcp
COM_MOON_AGENT_SCOPES=read,goals:write,ai:write
COM_MOON_HUB_WRITE_SECRET=<hub-write-secret>
COM_MOON_OPERATOR_SESSION_SECRET=<operator-session-secret>
COM_MOON_ENGINE_URL=http://localhost:3001
COM_MOON_SHARED_WEBHOOK_SECRET=<shared-hub-engine-secret>
```

Engine의 비공개 `apps/engine/.env.local`:

```dotenv
COM_MOON_SHARED_WEBHOOK_SECRET=<same-shared-hub-engine-secret>
GEMINI_API_KEY=<gemini-api-key>
GEMINI_MODEL=<model-id-enabled-for-this-api-project>
```

기존 기능에 필요한 Engine Supabase 등 설정은 유지한다. `GEMINI_API_KEY`의 호환 별칭은 `GOOGLE_GENERATIVE_AI_API_KEY`, 모델 별칭은 `AI_DEFAULT_MODEL`이다. 이 도움 기능은 기본적으로 Engine에 구성된 모델을 사용하고 실제 호출 모델명을 기록한다. Gemini API는 API 프로젝트의 자격·할당량·결제를 따른다. 세 클라이언트의 구독이 이 API 호출 비용을 포함한다고 가정하지 않는다. [Gemini API 결제 문서](https://ai.google.dev/gemini-api/docs/billing)에서 실제 프로젝트 상태를 확인한다.

`read`만 부여하면 읽기 전용이다. `goals:write`는 목표 명령, `ai:write`는 후보·검토·Gemini 요청·저장 복구 권한이다. 기존 권한이 필요하면 목록에 병합한다. MCP 설정의 actor/workspace 값으로 권한을 바꿀 수 없고, Hub 서버의 한 actor/workspace 설정을 세 클라이언트가 공유한다. 클라이언트별 별도 사용자 인증을 제공하는 구조는 아니다.

## 데이터베이스 적용

기존 Moonlight 스키마가 준비된 대상에서 **0036 → 0037** 순서를 지킨다. 0037의 원문 범위 검사는 0036의 함수를 사용한다. 두 마이그레이션은 새 목표·측정·연결·후보·영수증 저장소를 만들고 service_role만 접근하도록 설정한다.

로컬 전용 PostgreSQL/Supabase의 기존 스키마에 적용할 때:

```sh
psql "$MOONLIGHT_LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260921_0036_operating_goals.sql \
  -f supabase/migrations/20260921_0037_ai_assistance.sql
```

운영 적용은 별도 단계다. `npm run db:check`로 현재 연결 대상을 확인하고, 백업·대상 프로젝트를 확인한 운영 배포에서만 아래 명령을 실행한다. 이 스크립트는 로컬 psql이 아니라 **Supabase Management API**를 사용하며 `SUPABASE_ACCESS_TOKEN`과 `SUPABASE_PROJECT_REF` 또는 Supabase URL을 읽는다. 인자 없는 기본 목록에는 새 마이그레이션이 없으므로 파일을 명시한다.

```sh
npm run db:migrate -- 20260921_0036_operating_goals.sql 20260921_0037_ai_assistance.sql
```

운영 배포의 환경 변수·인증도 별도로 구성해야 한다. 로컬 테스트 통과나 코드 배포만으로 운영 DB 적용·세 클라이언트 연결이 완료되지는 않는다. 운영 데이터 대신 코드에 예시 업무 데이터를 넣지 않는다.

## 세 클라이언트에 같은 MCP 연결

세 클라이언트는 MCP를 로컬 **stdio** 프로세스로 띄운다. 프로세스를 띄울 수 없는 도구용으로 로컬 Streamable HTTP 전송(`npm run mcp:http`, 기본 `127.0.0.1:3333`, 도구별 bearer 토큰 필수)도 있지만 이 절은 stdio 등록만 다룬다 — [MCP 패키지 README](../packages/mcp-server/README.md#http-transport-other-tools). 별도 비공개 파일 `/absolute/private/moonlight-mcp.env`를 만들고 소유자만 읽도록 한다. Hub의 전체 `.env.local` 대신 다음 두 값만 둔다.

```dotenv
COM_MOON_HUB_URL=http://localhost:3000
COM_MOON_AGENT_API_TOKEN=<same-agent-token-as-hub>
```

Gemini 키·Supabase service-role·공유 webhook 비밀키는 MCP 클라이언트에 필요하지 않다. 등록은 런처 `packages/mcp-server/bin/moonlight-mcp.js` 하나를 절대 경로로 가리키고, 비공개 파일은 `COM_MOON_MCP_ENV_FILE`로 넘긴다. 이 값이 없으면 런처는 Hub `apps/hub/.env.local`을 읽어 쓰기 비밀키까지 싣는다. 아래 경로는 실제 Node 실행 파일·저장소·비공개 환경 파일의 절대 경로로 바꾼다. 기존 서버 목록에 병합하고 전체 파일을 덮어쓰지 않는다. 이 문서는 전역 클라이언트 설정을 자동 변경하지 않는다.

### Codex

`~/.codex/config.toml` 또는 신뢰한 프로젝트의 `.codex/config.toml`:

```toml
[mcp_servers.moonlight]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/moonlight/packages/mcp-server/bin/moonlight-mcp.js"]
tool_timeout_sec = 120

[mcp_servers.moonlight.env]
COM_MOON_MCP_ENV_FILE = "/absolute/private/moonlight-mcp.env"
COM_MOON_MCP_PROFILE = "assistant"
COM_MOON_MCP_API_MODE = "agent"
```

예전 형태(`--env-file=<비공개 파일>` + `src/index.js`)도 그대로 동작하고, `npm run mcp:connect -- install <client>`는 그 비공개 파일 경로를 `COM_MOON_MCP_ENV_FILE`로 옮겨 런처 등록으로 바꾼다. 저장 후 MCP 연결을 재시작하고 `/mcp` 또는 서버 목록에서 확인한다. 명령·인자·환경 변수 구성은 [공식 OpenAI MCP 문서](https://developers.openai.com/codex/mcp)를 따른다.

### Claude Desktop / Antigravity

두 클라이언트에 다음 JSON 서버 항목을 각각 병합한다.

```json
{
  "mcpServers": {
    "moonlight": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/moonlight/packages/mcp-server/bin/moonlight-mcp.js"],
      "env": {
        "COM_MOON_MCP_ENV_FILE": "/absolute/private/moonlight-mcp.env",
        "COM_MOON_MCP_PROFILE": "assistant",
        "COM_MOON_MCP_API_MODE": "agent"
      }
    }
  }
}
```

- Claude Desktop(macOS): Settings → Developer → Edit Config의 `~/Library/Application Support/Claude/claude_desktop_config.json`. 저장 후 앱을 완전히 종료하고 재시작한다. [공식 로컬 MCP 연결 안내](https://modelcontextprotocol.io/docs/develop/connect-local-servers).
- Antigravity: 전역 `~/.gemini/config/mcp_config.json` 또는 작업공간 `.agents/mcp_config.json`. IDE의 MCP Servers → Manage MCP Servers → View raw config에서 현재 파일을 열고 새로고침한다. CLI에서는 `/mcp`로 상태를 확인한다. [공식 Antigravity MCP 문서](https://antigravity.google/docs/mcp).

이 프로필의 `search_knowledge`와 `get_weekly_report`는 기존 Hub read 경로를 쓴다. 위 loopback 구성에서 사용하며, 원격 Hub에서는 기존 운영자 인증 게이트를 만족하는 별도 구성이 필요하다. Agent bearer만으로 기존 Hub 경로 인증을 대체하지 않는다.

연결 후 먼저 “Moonlight의 `get_hub_health`와 개인 범위 `get_goals`만 조회하고 설정·저장 상태를 알려줘”로 확인한다. 이 확인은 후보 쓰기나 유료 모델 호출을 요구하지 않는다. 기본 진단은 아래 명령이며 **core 8개 도구**를 검사한다. assistant의 13개 도구는 클라이언트 목록에서 별도로 확인한다.

```sh
node --env-file=/absolute/private/moonlight-mcp.env packages/mcp-server/src/doctor.js
```

## assistant 프로필 — 13개 도구

| 읽기 | 쓰기 |
| --- | --- |
| `get_hub_health` | `record_goal_command` |
| `get_work_context` | `save_ai_candidate` |
| `get_ai_candidate` | `request_ai_assist` |
| `search_knowledge` | `record_assist_outcome` |
| `get_weekly_report` | `recover_ai_candidate` |
| `get_goals` | |
| `get_goal_receipt` | |
| `get_assistance_receipt` | |

`get_goals`는 scope와 limit(1–20)을 받고 먼저 목표 목록을 반환한다. objectiveId를 넣으면 해당 목표의 최신 측정 지표를 페이지로 반환한다. 다음 페이지는 나머지 필터를 유지하고 nextCursor를 전달한다. 관찰 이력 전체는 Hub에 남고 근거 생략 여부가 표시된다.

`get_work_context`는 tasks/projects/content_items의 entityId·scope를 받는다. 원문은 20KB, 연결 목표는 최대 3개/지표 8개, 최근 후보는 최대 3개로 제한되며 문맥 응답은 96KB 안으로 줄인다. 후보 outputTruncated가 true이면 `get_ai_candidate`에 candidateId를 넣고, 이후 nextOffset·outputHash로 전체 텍스트를 읽는다. 출력 변경 시 이어읽기가 충돌하므로 첫 페이지부터 다시 조회한다. 주간 MCP 응답은 16KB 안에서 숫자·정의·측정 상태와 집계 근거를 유지하며 원장 예시는 축약한다.

## HTTP와 실패 복구

| 엔드포인트 | 인증·동작 |
| --- | --- |
| `GET /api/agent/v1/goals` | Agent `read`; 위 목표 페이지 계약 |
| `POST /api/agent/v1/goals/commands` | Agent `goals:write`; `{commandId,action,input,expectedRevision?}` |
| `GET /api/agent/v1/goals/commands?commandId=…` | Agent `read`; 영수증 |
| `GET /api/agent/v1/ai-assistance` | Agent `read`; entityType/entityId/scope로 문맥, commandId로 영수증, candidateId/offset/outputHash로 후보 |
| `POST /api/agent/v1/ai-assistance` | Agent `ai:write`; `{commandId,action,input}` |
| `POST /api/ai/assist`(Engine) | `x-com-moon-shared-secret`; Hub가 검증한 문맥으로 1회 생성 |

Agent 경로는 모두 `Authorization: Bearer <COM_MOON_AGENT_API_TOKEN>`을 사용한다. 동일 기능의 브라우저 경로는 `/api/hub/goals`, `/api/hub/goals/commands`, `/api/hub/ai-assistance`이며 기존 운영자 인증과 Hub write guard를 따른다. read의 HTTP 200에도 status:error가 올 수 있어 봉투를 검사해야 한다.

AI action은 generate/save_candidate/review_candidate/recover_candidate다. generate·save_candidate는 원문의 expectedSourceUpdatedAt과 실제 scope를 검증하고, review_candidate는 후보 expectedRevision을 검증한다. 각 새 명령에 UUID를 한 번 만들고 보관한다. 같은 ID·내용은 영수증을 재사용하고, 같은 ID의 다른 내용은 충돌한다.

- 응답이 끊기면 먼저 같은 commandId 영수증을 조회한다. 영수증 없음도 진행 중 거래를 배제하지 않는다. running/unknown은 완료가 아니며 새 ID로 유료 요청을 자동 재시도하지 않는다.
- 생성 후 저장 실패는 unsaved와 **출력 미리보기 + 서명된 recoveryToken**을 반환한다. 둘 다 보관한 뒤 원래 commandId로 recover_ai_candidate를 호출하면 모델을 다시 부르지 않고 완전한 결과를 저장한다. 토큰은 압축된 전체 결과를 포함하고 workspace·actor·원래 명령에 묶이며 24시간 유효하다. 미리보기를 전체 결과로 오인하지 않는다.
- Hub는 응답을 받은 뒤 요청·복구 정보를 sessionStorage에 보관한다. 탭 종료·저장소 삭제·토큰 만료 이후까지 보장하는 영속 백업은 아니다. 프로세스가 모델 응답을 받기 전에 죽은 경우에는 없는 결과를 복구하거나 성공으로 표시하지 않는다.
- 복구 토큰 없이 외부 텍스트를 저장하면 client-reported 후보다. 클라이언트가 임의로 작성한 텍스트에 검증된 Gemini 출처를 부여하지 않는다.

Gemini 공급자 제한 시간은 45초, Hub→Engine은 60초, MCP 도움 요청은 90초다. 모델 자동 재시도는 없다. 원문·범위·revision 충돌은 새 문맥을 확인한 후 별도의 검토된 명령으로 해결한다.
