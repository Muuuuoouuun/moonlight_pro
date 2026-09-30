# 공개 AI 도구 7종의 Moonlight 적용성 검토

> 검토일: 2026-09-26 · 코드 기준: `fb023335`
> 상태: 조사 완료 · 아래 적용 방향은 제안이며 구현 승인이나 실행 완료를 뜻하지 않는다.
> 범위: 사용자 제공 Notion 원문, 공식 저장소·모델 카드·라이선스, Moonlight의 코드와 확정 운영 경계를 대조했다. 도구 설치·모델 실행·운영 DB 변경·배포는 수행하지 않았다.

## 1. 결론

응용할 수 있다. 당장 업무에 붙이기 좋은 것은 Anthropic의 리서치·미팅 준비 절차이며, Symphony는 기존 Codex worker를 발전시킬 참고 구조다. Cloudflare OS에서는 작업별 작은 도구와 좁은 권한 설계를 참고할 가치가 있다. Qwen3-TTS는 콘텐츠 내레이션 실험 후보로 적합하다.

Moonlight에는 이미 요청서, 실행기, 결과 기록이 있다. 이번 자료를 적용할 때의 중심은 기존 흐름에서 실제 산출물 한 건을 끝내고, 검토 시간과 수정량을 측정하는 것이다.

| 도구 | 적용성 판단 | Moonlight에서 가능한 응용 | 우선순위·조건 |
| --- | --- | --- | --- |
| Anthropic Financial Services | 높음, 절차 선별 | Market Researcher의 근거 중심 조사, Meeting Prep의 고객 미팅 준비, 표·숫자 검토 절차를 로컬 스킬로 적용 | 첫 시범 권장. 금융 전용 평가 모델·유료 데이터 의존성은 업무에 맞춰 조정 |
| OpenAI Symphony | 높음, 실행 구조 참고 | 선택한 개발 작업의 독립 작업 공간, 재시도·중단 상태, 테스트·변경 내역 등 검토 증거 | 기존 worker의 수동 작업 1건을 검증한 뒤 확장. 상시 자동 분배는 별도 결정 |
| Cloudflare OS | 높음, 설계 참고 / 전체 도입 비용 큼 | 특정 자료의 비교표·미팅 브리핑·분석 도구, 자원별 권한 제한, 실행 이력 | 기존 화면 예산 안에서 연결. 전체 런타임 전환은 후순위 |
| Qwen3-TTS | 중간 | 승인한 Shorts·교육 자료 원고에서 한국어 음성 파일 생성 | 로컬 콘텐츠 제작 스킬로 먼저 측정. 이 Mac에서 속도·메모리·품질 미검증 |
| x-algorithm | 제한적 | 콘텐츠 가설을 만들 때 반응·부정 반응·다양성을 함께 보는 관점 | X 전용 근거. Threads·Instagram에 가중치나 성과 예측을 그대로 적용할 수 없음 |
| PersonaPlex | 현재 낮음 | 향후 영어 음성 상담·역할 연습 | 공식 모델 카드는 영어 입출력과 NVIDIA/Linux 중심 환경을 명시. 한국어 고객 업무의 첫 선택으로 부적합 |
| Hunyuan3D-2 | 현재 도입 보류 | 3D 콘텐츠 자산 제작 가능성 자체는 있음 | 현재 업무와의 연결이 약하고, 해당 라이선스가 한국을 적용 지역에서 제외 |

공식 기능 근거: [Anthropic](https://github.com/anthropics/financial-services), [Symphony](https://github.com/openai/symphony), [Cloudflare OS](https://github.com/cloudflare/cloudflare-os), [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS), [X](https://github.com/xai-org/x-algorithm), [PersonaPlex 모델 카드](https://huggingface.co/nvidia/personaplex-7b-v1), [Hunyuan3D-2 라이선스](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/LICENSE). 적용성·우선순위는 이 자료와 Moonlight 운영 기준을 대조한 판단이다.

## 2. 이미 있는 기반과 실제 추가 작업

### 2.1 Symphony → 기존 Codex worker의 검토 가능한 결과

공식 구현은 이슈별 작업 공간에서 Codex App Server를 실행하는 오케스트레이터다. 확인한 최신 README에는 Linear 외에 GitHub Issues·Jira·Asana·GitLab 어댑터도 있다. Moonlight 전용 연결은 별도 구현 대상이다. 공식 구현은 평가용 prototype으로 안내된다. [공식 실행 문서](https://github.com/openai/symphony/blob/main/elixir/README.md)

Moonlight의 [worker 문서](../../packages/codex-worker/README.md)와 [실행 코드](../../packages/codex-worker/runtime.mjs), [설정 검사](../../packages/codex-worker/config.mjs)에는 다음이 이미 있다.

- 운영자가 명시적으로 시작하는 단일 작업 실행.
- 등록된 저장소와 별도 apply worktree, read/draft/apply 모드.
- lease·heartbeat·취소·중단 후 재개·요청 중복 방지.
- 시간·턴·이벤트 예산, 보고된 토큰 사용량, 결과와 체크포인트.

추가 가치가 있는 항목은 **작업마다 격리된 checkout 관리**, **완료 조건에 맞춘 증거 묶음**, **검토 대기 상태와 재작업 흐름**이다. 증거에는 실행한 검사와 결과, 변경 파일, 실제 생성한 산출물 위치를 연결한다. PR은 실제로 만들었을 때만 연결한다.

현재 worker는 사전에 등록된 apply worktree를 재사용하며 직접 branch 생성·merge·push를 하지 않는다. 네트워크·웹 검색·사용자 플러그인·MCP 환경도 차단한다. 따라서 이 worker에 웹 리서치나 개인 로컬 스킬이 이미 연결돼 있다고 해석하면 안 된다. 개발 worker와 운영자 로컬 스킬은 서로 다른 실행 경로다.

제안 흐름:

```text
운영자가 작업·완료 조건 선택
  → 로컬 실행기
  → 변경·검사·산출물 증거
  → 운영자 검토
  → 실제 결과 기록, 필요할 때만 할 일 완료
```

### 2.2 Anthropic → 리서치·미팅 준비 로컬 스킬

공식 저장소는 업무별 agent·skill·connector의 참조 템플릿이다. Moonlight에 맞춰 우선 가져올 부분은 조사 질문, 근거 수집, 누락 표시, 보고서 형식이다. 금융기관용 가치평가·KYC 전체를 적용할 이유는 현재 확인되지 않는다. 연결 데이터 공급자에 따라 별도 구독이나 API 키가 필요하다. [공식 구성·연결 문서](https://github.com/anthropics/financial-services#agents)

첫 시범으로 **선택한 고객 한 명의 미팅 준비 문서**를 권장한다.

- 입력: 사용자가 선택한 고객의 최근 연락 기록, 미팅 목적, 허용한 공개 자료.
- 출력: 확인된 사실, 고객 우려, 이번 미팅에서 확인할 질문, 참고 출처, 미확인 항목.
- 실행: 운영자 Mac의 Claude Code·Codex 세션. 금융 전용 용어·형식은 고객 업무에 맞춰 조정.
- 완료 증거: 실제 문서 경로 또는 URL과 핵심 요약. 전송·고객 연락 완료로 취급하지 않는다.
- 평가: 준비 시간, 근거 없는 주장 수, 사용자가 고친 내용, 실제 사용 여부.

기존 [스킬 요청 서비스](../../apps/hub/lib/skill-requests.js)는 연결된 할 일, 회사/개인 범위, 지시, 기대 증거를 받는다. 결과는 `completed/failed/unconfirmed`, 요약, 경로·URL·메모 증거로 기록하며 `completed`에는 증거가 필요하다. 결과 기록과 할 일 완료는 별개다.

콘텐츠 조사에도 같은 절차를 적용할 수 있다. 다만 현재 [Brave 뉴스 검색](../../apps/hub/lib/research-news.js)은 발견 기능이고, [리서치함 → 콘텐츠 후보·Studio 설계](../superpowers/specs/2026-09-23-research-inbox-content-promotion-design.md)는 구현 미착수로 기록돼 있다. 첫 결과를 로컬 문서로 검토하고, 향후 연구 결과 저장·Studio 전환의 계약을 연결하는 순서가 맞다.

### 2.3 Cloudflare OS → 작업별 작은 도구와 권한 경계

Cloudflare OS는 별도 sandbox의 Gadget, 재사용 Blueprint, 외부 자원의 접근·행동을 중재하는 Gatekeeper를 제공한다. Workers·Durable Objects·Dynamic Workers·Facets 기반이며 자체 workerd 운영도 가능하다. 전체 도입은 Moonlight의 Next.js·Supabase 구조와 별도 실행·저장 체계를 관리하게 한다. 로컬 모드는 체험용이고 early access 상태다. [공식 구조](https://github.com/cloudflare/cloudflare-os#overview-what-is-cloudflare-os-really)

응용 제안은 한 작업에 필요한 자료만 담은 비교표·분석 결과·브리핑을 만들고 기존 작업에서 여는 방식이다. 새 메뉴와 패널을 계속 추가하지 않는 현행 표면 예산을 따른다. 처음에는 지정 자료를 읽는 산출물로 시작하고, 쓰기 기능에는 기존 인증·scope·write guard·receipt 경로를 사용한다.

**그대로 가져오면 충돌하는 부분:** 공식 Gatekeeper 설명에는 외부 쓰기를 시뮬레이션한 뒤 에이전트에게 완료처럼 보이게 하고, 사용자가 나중에 승인하는 방식이 있다. Moonlight에서는 이를 적용하더라도 시뮬레이션은 `미리보기/실행 대기`로 분리해야 한다. 실제 저장·발송·완료 receipt를 만들 근거로 사용할 수 없다.

### 2.4 Qwen3-TTS → 콘텐츠 원고의 한국어 내레이션

공식 모델은 한국어를 포함한 10개 언어와 CustomVoice·VoiceDesign·Voice Clone 계열을 제공한다. 첫 실험은 기본 제공 한국어 음색으로 이미 승인한 원고를 음성 파일로 만드는 정도가 적합하다. 타인의 목소리 복제는 이 시범에 필요하지 않다. [공식 기능·예제](https://github.com/QwenLM/Qwen3-TTS), [CustomVoice 모델 카드](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice)

전사 도구가 아니므로 회의 녹음 → 텍스트 입력 문제를 해결하지는 않는다. 초기에는 로컬 스킬의 파일 결과로 다룬다. Studio의 음성 첨부·플레이어·자막·영상 렌더는 별도 구현 범위다. 한국어 숫자·고유명사 발음, 생성 시간, 메모리, 재녹음 횟수를 실제 원고로 확인한 뒤 연결을 판단한다.

## 3. 원문의 설명에서 수정해야 하는 부분

| 원문 취지 | 공식 자료로 확인한 한계·정정 |
| --- | --- |
| 사내 도구 7종을 그대로 공개했다 | 업무 프로그램, 추천 코드, 모델, 참조 스킬 템플릿이 섞여 있다. 일곱 개 모두 완성된 사내 업무 앱이라고 볼 근거는 부족하다. |
| 내 컴퓨터에서 돌리면 비용 0원 | 도구 코드 비용과 모델 사용·GPU·호스팅·전화 연결·유료 데이터 비용은 별개다. 실제 비용 절감률은 이 검토에서 측정하지 않았다. Symphony도 Codex 실행이 필요하고 Cloudflare OS도 모델 공급자를 사용한다. |
| 금융 플러그인은 Claude 비용만 발생 | 공식 문서가 데이터 공급자 MCP에 별도 구독·API 키가 필요할 수 있다고 명시한다. [연결 문서](https://github.com/anthropics/financial-services#data-connectors) |
| X 코드로 다른 SNS의 노출 기준도 알 수 있다 | X For You의 코드다. 가중치는 실제 반응 횟수가 아니라 개인별 반응 예측치에 적용되며 비공개 일부 규칙도 있다. Threads·Instagram의 순위 공식을 입증하지 않는다. [X 공식 설명](https://github.com/xai-org/x-algorithm#scoring-and-ranking) |
| PersonaPlex로 국내 전화 안내를 바로 만들 수 있다 | 모델 카드는 영어 음성 입력·영어 응답을 명시한다. 한국어 실무 품질과 전화 연동은 검증되지 않았다. [모델 카드](https://huggingface.co/nvidia/personaplex-7b-v1) |
| Hunyuan3D-2는 한국에서 개인 연습은 자유 | 라이선스 §1의 Territory에서 한국을 제외하고 §2·§5(c)는 지역 밖 사용도 허용하지 않는다. 개인 연습 예외가 명시돼 있지 않으므로 원문 설명을 이용 허락의 근거로 삼을 수 없다. 별도 허락 여부를 확인해야 한다. [라이선스 원문](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/LICENSE) |
| 해외 외주 단가가 수익 가능성을 보여준다 | 글에 적힌 외주 단가·비교 서비스 요금은 이번 적용성 판단의 근거로 사용하지 않았다. 수주·마진·절감 효과를 검증한 자료가 아니다. |

## 4. 적용 방식 비교와 권장 순서

아래 규모는 비교 판단이며 일정 견적이 아니다.

| 방식 | 규모 | 장점 | 부담 | 판단 |
| --- | --- | --- | --- | --- |
| A. 로컬 스킬로 산출물 1건 검증 | 작음 | 기존 요청서·receipt 재사용, 실제 도움을 빠르게 측정 | 앱 안 자동 연결은 제한적 | **첫 단계 권장** |
| B. 기존 실행기·산출물 연결 보강 | 중간 | 작업 격리·검사 증거·재개 흐름을 일관되게 관리 | worker/스킬 경로 구분과 계약 설계 필요 | A에서 반복 수요 확인 뒤 권장 |
| C. Symphony·Cloudflare OS 전체 도입 | 큼 | 별도 오케스트레이션·앱 생성 환경 확보 | 중복 실행·저장 구조, 운영 부담, 현행 경계 재결정 | 현재 우선순위 낮음 |

권장 순서는 **미팅 준비 또는 브랜드 리서치 1건 → 기존 worker 작업 1건의 증거 검증 → 필요할 때 한국어 내레이션 시범**이다. 개발 구조 변경은 9/28 실사용과 10월 개발 동결이라는 확정 일정에 맞춰 별도로 범위를 정한다.

현행 [에이전트 계층 결정](../superpowers/specs/2026-09-24-agent-layer-direction.md)은 Office의 역할을 판단·초안·검토로 한정하고, 실행은 로컬 Claude Code·Codex가 맡도록 한다. 발동은 운영자 선택이며 자동 업무 생성·외부 발송을 허용하지 않는다. 제안된 응용도 이 경계를 따른다.

## 5. 검증 기록과 한계

- 요청한 원격 브랜치를 fetch한 뒤 로컬 `09.bigmac1.5`로 전환했다. `HEAD=fb023335`, 전환 후 tracked diff는 없었다. 이전 checkout의 HEAD는 가져온 버전의 조상이었고 커밋 차이는 318건이었다.
- Notion 원문은 웹 추출기·연결 도구에서 읽지 못해 브라우저로 전체 본문을 확인했다. [사용자 제공 원문](https://wandering-mile-86e.notion.site/AI-3e398dec8eed81f7a7d2ebafad05cbe8)
- 도구 기능·조건은 공식 자료로 교차 확인했다. 공식 `main` 문서는 추후 바뀔 수 있으므로 실제 설치 때 버전을 다시 고정해야 한다.
- Moonlight의 운영자 프로필, 문서 지도, 에이전트 계층 결정, worker 설정·실행 코드, 스킬 요청·결과 검증 코드를 대조했다.
- 코드·설정 변경 없이 검토 문서만 추가했다. 테스트·모델 시범·운영 DB 재확인은 수행하지 않았으므로 통합 동작·속도·절감액은 미검증이다.
