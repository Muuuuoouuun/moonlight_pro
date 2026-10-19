# 재시작 후 로그아웃 유지 — 미해결 평가

**판정:** JS 브리지의 로그아웃 표시가 인스턴스 재시작 뒤 사라지는 것은 실행 증거가 있다. 이것이 실제 Mac의 원치 않는 자동 재로그인으로 이어지는지는 조건부 소스 분석이며, 실기 재현으로 확정하지 않았다. 기존 6개 패치는 변경하지 않았고 새 수정·보안 정책 변경도 하지 않았다.

**기준:** 감사 원본 `67eb1d9b316843f5acd70de513d5a7b8d823bfdc`와 보존된 후속 JS snapshot 패치. 전달용 Office `12103a76…` 기준 draft PR 준비와 별개로, 이 평가의 실행 증거 기준은 원래 검증한 `67eb1d9b…`다. 최신 주 후보로 전달된 `7ba…`는 원격에서 회수하지 못해 **미검증**이다.

## 확인된 JS 증거

[`bridge-probes.test.cjs`](../evidence/desktop/session/bridge-probes.test.cjs)의 `shell restart loses explicit logout marker` 시험과 [실행 로그](../evidence/desktop/session/bridge-probes.log)에 `beforeRestartSignedOut:true → afterRestartSignedOut:false`, 재시작 후 `session:null`이 기록되어 있다. Linux에서 실제 로컬 Unix socket과 메모리 cookie double을 사용했다. 정확히는 **같은 Node 프로세스 안에서 브리지 인스턴스를 닫고 다시 만든 재현**이며 Electron 앱/OS 전체 재시작 시험은 아니다. 입력 event는 기존 코드가 로그아웃으로 분류하는 `expired-overwrite`였다. 실제 사용자 로그아웃 클릭이나 Keychain 접근은 수행하지 않았다.

원인은 `apps/desktop/hub-session-bridge.js`의 `signedOutOrigins = new Set()`이 인스턴스 메모리에만 있기 때문이다(원본 78행). 후속 snapshot 패치도 이 상태를 영속화하지 않는다. 그 패치는 조회 중 로그아웃·재로그인·진행 중 cookie write의 모순 응답만 고쳤으므로, **snapshot 회귀 통과와 재시작 후 로그아웃 유지 여부는 별개**다.

## Mac에서 영향을 받을 수 있는 조건

원본 `HubTransport.swift`에서 새 transport의 `automaticLoginAllowed`는 true(161행)다. `syncDesktopSession`은 `signedOut:true`를 실제로 받은 경우 자동 로그인 무효화와 해당 origin의 저장 자격 증명 제거를 수행한다(425~430행). 재시작 뒤 `session:nil/signedOut:false`만 받으면 그 분기에 들어가지 않는다. 이후 `sessionStatus`가 anonymous를 받거나 제한된 일반 API 요청이 명시적인 인증 거절을 받으면 `restoreLogin`이 저장 자격 증명을 읽어 인증을 시도할 수 있다(223~242, 324~328, 366~375행).

따라서 **같은 origin의 유효한 저장 자격 증명이 남아 있고, native 앱이 로그아웃 표시를 놓쳤거나 꺼져 있었으며, 브리지가 그 표시를 잃은 뒤 자동 인증 경로가 실행되는 경우**가 검증 대상이다. 이미 native 앱이 로그아웃을 받아 자격 증명을 제거했거나 저장 자격 증명이 없는 경우까지 자동 재로그인을 단정할 수 없다. 실제 서버 수락·로그인 성공·인증 우회는 확인하지 않았다.

## 구현 전에 결정할 정책과 시험 조건

- **제품 결정:** Hub 셸 로그아웃이 companion의 저장 로그인까지 재시작 후에도 해제해야 하는지, 아니면 셸 세션에만 적용되는지 명시해야 한다. 자연 만료·브리지 일시 불가·처음 실행의 익명 상태와 명시 로그아웃을 어떻게 구별할지도 정해야 한다.
- **지속 상태가 필요하다면:** origin별 보관 주체, 유지 기간, 명시 재로그인 시 해제 조건, 여러 앱 인스턴스의 변경 순서, 손상/기록 실패 시 표시·복구 동작을 먼저 합의해야 한다. 지속 로그아웃 표식이나 자격 증명 삭제 정책은 이번에 임의 도입하지 않았다.
- **시험:** JS에서는 명시 logout write/관련 cookie event, 자연 만료, logout→재로그인, 다른 origin을 분리해 같은 프로세스와 별도 프로세스 재시작을 검사한다. 승인된 Mac 시험 환경에서는 임시 origin·격리 자격 증명으로 companion 실행/중지, 셸 재시작, 저장 자격 증명 유/무, 순서 역전을 조합하고 인증 POST 횟수·세션 상태·자동 로그인 표시를 확인해야 한다. 선택한 정책에 따라 기대 결과를 먼저 고정한다.

이번 평가에는 새 테스트 실행·운영 endpoint/DB 접근·Claude API 호출·native compiler 우회·이전 denied 작업 재시도가 없다. 실제 Mac/Windows native 동작 검증과 `7ba…` 후보 검증은 남아 있다.
