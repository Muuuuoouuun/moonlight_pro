# Moonlight Vertex Cloud 연결

상태: 코드/로컬 빌드 검증, 정상화 계정 ADC 로그인, 운영 IAM 생성 완료. 로컬에서 Vertex의 gemini-3.5-flash와 gemini-3.1-pro-preview 실제 호출 HTTP 200 확인. Vercel 배포/운영 호출과 결제 반영 확인은 진행 중이다.

## 대상과 과금 경로

- GCP 프로젝트: `project-1dd9933a-77b3-4f19-b3f` (`My First Project`, 번호 `267043101108`).
- 기존 Cloud 결제 계정: `01E161-3B1838-48153D`.
- 확인한 크레딧: Free Trial ₩407,626, 만료 2027-01-20; 개발자 월간 크레딧 ₩13,588, 만료 2027-10-21.
- Vertex API (`aiplatform.googleapis.com`)를 호출해야 한다. AI Studio Developer API (`generativelanguage.googleapis.com`)의 사용료에는 $300 Welcome 크레딧이 적용되지 않는다.
- 인증 성공만으로 실제 크레딧 차감이 검증된 것은 아니다. 작은 호출 이후 Billing 보고서의 서비스/SKU와 프로모션 크레딧 차감을 확인한다. 결제 보고서는 지연될 수 있으며 실제 차감할 크레딧의 우선순위를 앱이 선택하지 않는다.
- 프로젝트나 결제 계정을 새로 만들지 않는다. API 키 차단 조직 정책도 변경하지 않는다.

## 코드

`@com-moon/genai-transport`가 Hub와 Engine의 호출 주소와 인증을 공유한다. 기존 요청 본문과 응답/토큰 기록 방식은 유지한다.

`GEMINI_BACKEND=developer`(기본)는 이전 키 인증을 유지한다. 운영 인증 준비를 마친 뒤 Hub와 Engine 모두 `vertex`로 변경한다. `vertex`에서 설정/인증이 실패하면 AI Studio API 키로 대체 호출하지 않는다. Vertex에서는 `GEMINI_API_BASE_URL`을 무시해 Bearer 토큰이 다른 호스트로 전송되는 것을 막는다.

```dotenv
GEMINI_BACKEND=vertex
GOOGLE_CLOUD_PROJECT=project-1dd9933a-77b3-4f19-b3f
GOOGLE_CLOUD_LOCATION=global
```

모델 별칭은 기존 설정과 호출자가 요청한 값을 유지한다. 실제 Vertex에서 해당 모델의 제공 여부를 검증하고, 미지원 모델이면 운영자가 승인한 모델로 설정을 조정한다. `GEMINI_MODEL`과 별도 품질 모델 `COM_MOON_CONTENT_QUALITY_MODEL`을 각각 확인한다.

## 로컬 ADC

Google 공식 gcloud CLI로 정상화 계정에 로그인하고 ADC를 만든다. 로그인 URL과 인증 코드는 작업 중 외부에 공유하지 않는다. ADC JSON을 저장소나 Vercel에 배포하지 않는다.

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project project-1dd9933a-77b3-4f19-b3f
```

기본 위치 외에 저장하면 gitignore된 로컬 env에 `GOOGLE_APPLICATION_CREDENTIALS`로 절대경로를 설정한다. Hub/Engine `.env.local`의 다른 값은 보존하고 위 세 설정만 추가/갱신한다.

```sh
node --env-file=apps/engine/.env.local scripts/check-vertex-connection.mjs
```

확인 스크립트는 짧은 연결 프롬프트만 보내고, 비밀값/프롬프트/공급자 오류 원문 없이 상태와 토큰 수만 출력한다.

## Vercel 운영 인증 구성

조회로 확인한 운영 대상:

| 앱 | Vercel 프로젝트 ID | 인증 |
| --- | --- | --- |
| moonlight-pro-engine | prj_LBMHlLO8brDF3OW1HtKA5egJ7in2 | OIDC 활성, team issuer |
| moonlight-pro-hub | prj_XClsSs6P3JJkXhW5aF9KgWu1TDAo | OIDC 활성, team issuer |

팀: `muuuuoouuuns-projects`, ID `team_0jcdDqLABZA9p1S2imXZMMLd`.

사용자의 실행 전 승인 후 다음 권한/리소스를 생성했고, provider ACTIVE 상태와 두 운영 subject의 impersonation 권한을 조회로 검증했다.

1. 서비스 계정 `moonlight-vertex@project-1dd9933a-77b3-4f19-b3f.iam.gserviceaccount.com`을 생성한다. 장기 키는 만들지 않는다.
2. 프로젝트의 커스텀 역할 `moonlightVertexCaller`에 `aiplatform.endpoints.predict`, `serviceusage.services.use`만 넣어 이 서비스 계정에 부여한다.
3. Workload Identity Pool `moonlight-vercel`, OIDC provider `vercel`을 생성한다.
4. issuer `https://oidc.vercel.com/muuuuoouuuns-projects`, 허용 audience `https://vercel.com/muuuuoouuuns-projects`, 매핑 `google.subject=assertion.sub`로 설정한다.
5. provider 조건은 다음 팀 ID, 두 프로젝트 ID, `production` 환경으로 제한한다. Preview/Development에는 권한을 주지 않는다.

```text
assertion.owner_id == 'team_0jcdDqLABZA9p1S2imXZMMLd' &&
assertion.environment == 'production' &&
assertion.project_id in ['prj_LBMHlLO8brDF3OW1HtKA5egJ7in2', 'prj_XClsSs6P3JJkXhW5aF9KgWu1TDAo']
```

6. 각 운영 subject에만 서비스 계정의 `roles/iam.workloadIdentityUser`를 부여한다.

```text
owner:muuuuoouuuns-projects:project:moonlight-pro-engine:environment:production
owner:muuuuoouuuns-projects:project:moonlight-pro-hub:environment:production
```

7. Hub/Engine의 기존 `.env.production.local`을 보존하면서 아래 설정과 위 Vertex 설정을 추가한다. 운영자의 사용자 ADC JSON, refresh token, 액세스 토큰을 넣지 않는다.

```dotenv
GCP_PROJECT_NUMBER=267043101108
GCP_SERVICE_ACCOUNT_EMAIL=moonlight-vertex@project-1dd9933a-77b3-4f19-b3f.iam.gserviceaccount.com
GCP_WORKLOAD_IDENTITY_POOL_ID=moonlight-vercel
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=vercel
```

Vercel에서는 `VERCEL=1`이면 OIDC 인증을 사용하며 불완전한 연동은 설정 오류로 닫힌다. Google Auth Library가 짧은 수명의 Google 토큰을 캐시/갱신하고, Vercel OIDC supplier는 토큰 교환 시마다 현재 토큰을 가져온다.

환경 변수 반영·배포는 `vercel-deploy.md`의 기존 스크립트와 절차를 따른다. 두 운영 배포의 identity를 확인한 뒤 Gemini 호출을 검증한다. 실패하면 `GEMINI_BACKEND`를 명시적으로 원래 값으로 되돌리고 재배포하며, Vertex 실패를 자동으로 Developer API 과금으로 돌리지 않는다.

## 검증 기록

- 전체 회귀 테스트: 6,211개 중 6,196개 통과, 15개 건너뜀, 실패 0개.

- 로컬 ADC 실제 호출: gemini-3.5-flash HTTP 200 (총 130토큰), gemini-3.1-pro-preview HTTP 200 (총 179토큰).
- Engine TypeScript 및 프로덕션 빌드 통과.
- Hub 프로덕션 빌드 통과. 브라우저용 회의 요약 포맷 함수를 별도 파일로 분리하여 Google 인증 코드가 클라이언트에 포함되지 않도록 했다.
- 공통 transport: Vertex 주소/프로젝트/Bearer, 지역 주소, 잘못된 설정, 인증 실패 시 대체 호출 금지, Vercel federation 설정, 호출 전 취소, 기존 API 키 호환 검증.
- Hub: 명함/회의/미디어 분석의 Vertex 요청 및 인증 실패 시 대체 호출 금지 검증.
- Engine: 구조화 출력과 토큰 기록의 Vertex 응답 호환 검증.

공식 근거: [Google API 키와 ADC](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start/api-keys?usertype=standard), [Vercel Google Cloud OIDC](https://vercel.com/docs/oidc/gcp), [Google 무료 체험 제한](https://docs.cloud.google.com/free/docs/free-cloud-features).
