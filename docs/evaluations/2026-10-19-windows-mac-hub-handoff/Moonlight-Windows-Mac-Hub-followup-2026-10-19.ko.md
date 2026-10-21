# Moonlight Windows↔Mac/Hub 후속 검증 및 별도 수정 후보

검증일 2026-10-19 UTC. 저장소 `Muuuuoouuun/moonlight_pro`. 기준 후보 `67eb1d9b316843f5acd70de513d5a7b8d823bfdc`.

기존 세 패치의 범위를 다시 확인하고, 그 세 패치를 모두 적용한 상태에서도 남는 결함을 재현했다. 추가 JavaScript 패치 세 개를 별도로 작성했다. **기존 세 개와 후속 세 개를 함께 적용한 Desktop 전체 검사는 408건 중 405 pass / 0 fail / 3 skip이다.** 원본 후보, 입력 Library ZIP, 최초 보고서·증거 ZIP·패치는 보존했다. 최종 상태는 검토용 로컬 패치이며 새 커밋·원격 브랜치·PR·배포는 없다.

Windows/Mac 실기 연동을 완료했다고 판정하지 않는다. Swift 후보는 컴파일·실행하지 못했고, 후속 세션 수정은 Linux에서 JavaScript UNIX-socket 계약과 메모리 쿠키 대역으로 검증했다. 실제 Electron cookie 이벤트·로그인·Keychain·Acrylic·hotkey 검증과 구분한다.

## 회수·최신 refs·기존 검증 보존

입력은 Library `libfile_99a65bb41c748191b85750da0e072fc1`의 `Moonlight-R8-local-integration-2026-10-19-67eb1d9b.zip`이다. 경로 안전성·CRC·419개 SHA256 항목 및 최종 manifest 5개를 확인했고 bundle verify/fsck, patch 적용 tree 동일성을 검증했다. 입력 ZIP SHA256은 `10067542a9b7313039e081001778daa3848f34012bc1cc7b395a00ef6c9e587d`이다.

마지막 실제 원격 읽기 조회는 **2026-10-19 11:50:28 UTC**이며 후속 단계에서 재조회하지 않았다.

| 대상 | 확인 결과 |
|---|---|
| main | `94a71abd78b958a137746f5ab90fc6791d0b2c58` |
| Windows PR #38 | `dbd357b3508ff8252c83490653c8c7ab4a909bf1`, open/draft/미병합 |
| codex/office-connection-20261002 | `12103a76eadef632a57f0da151487d8076fcecdd` |
| 회수 후보 | `67eb1d9b316843f5acd70de513d5a7b8d823bfdc`; 위 세 대상보다 각각 48/47/41커밋 앞선 후손 |

후보와 Office ref의 `apps/desktop` tree는 `e5e15a64cdf663e9756ac8c99b8b2921dcc180d3`으로 같다. 원본 후보에서 lockfile 의존성(Next 16.3.8), Node 24.19.0/npm 11.9.0으로 전체 **5576 pass / 3 fail / 34 skip**, Desktop **372 pass / 3 skip**, Hub·Engine webpack build 및 workspace typecheck exit 0을 확인했다. main에서 같은 실패 3개를 재현했다. `config.test.mjs` 2건과 `office-codex-provider.test.mjs`의 종료 프로세스 그룹 ESRCH 1건이며, 통과로 처리하지 않는다. 호스트 등록·launcher·env 격리 시험은 25 pass였다.

최초 전체 보고서와 증거는 `previous/`에 그대로 포함한다. 최초 증거 ZIP SHA256은 `a1f442ecfe9038a2de261c46b73c040feac98cd7565268898ff2a2b08ceb85ad`이며 후속 작업 뒤에도 일치한다.

## 원래 세 패치: 무엇을 고쳤고 무엇은 남았는가

| ID·패치 | 변경 경로 | 수정 및 전후 증거 |
|---|---|---|
| O1 `desktop-generation-guard.patch` | `apps/desktop/pet/main/pet-hub.js`; 신규 `apps/desktop/pet/main/pet-hub-generation.test.js` | 준비를 기다리던 `chatSend`/`tick`의 연결이 교체되면 전송 전에 거부한다. 제품 코드 2줄. 신규 4회귀 **4 fail → 4 pass**, 관련 선택 76 pass. |
| O2 `hub-contract-retry-candidate.patch` | `apps/hub/lib/office/engine-client.js`; 신규 `apps/hub/lib/office/engine-client-retry.test.mjs` | 이미 받은 4xx 또는 응답·버전·owner·context 계약 거부 뒤 생성 POST를 반복하던 catch를 제한한다. 신규 3회귀 **1 pass/2 fail → 3 pass**, 관련 선택 18 pass, 확장 216 pass/2 skip. legacy 502/503와 전송 예외 재시도는 유지한다. |
| O3 `native-preflight-generation.patch` | `prototypes/moonlight-pet-macos/Sources/MoonlightPetPreview/Support/HubTransport.swift`; `prototypes/moonlight-pet-macos/Tests/MoonlightPetPreviewTests/HubTransportTests.swift` | 공유·desktop 세션 preflight await 뒤 연결 세대와 Task 취소를 확인한다. 소스·적용·공백 검사 완료. 기존 Node wiring 4 pass. **신규 Swift 2시험/12조합의 변경 전후 실행·컴파일은 모두 미수행**이다. |

O1/O2/O3는 원본 후보에 각각 적용 검사 exit 0이고, 세 개를 함께 적용한 별도 checkout에서도 충돌·공백 오류가 없었다. 그 누적본의 Desktop 376 pass/3 skip, Office+native wiring 선택 190 pass/2 skip, Hub webpack build exit 0을 확인했다. **이 누적본의 루트 전체 시험은 다시 실행하지 않았다.** 서로 겹치는 선택 시험 수를 합산하지 않는다.

**아래 D2·D3·긴 회의·세션 문제는 원래 세 패치 이후에도 남는 문제다.** 원본 후보에만 있는 결함으로 보고하지 않는다. 후속 증거 `office-409-after-original-three.json`, `queued-cancel-after-original-three.json`, `session-probes-after-original-three.log`, `followup-hub/original-three-patches/`가 해당 누적본의 재현을 담는다.

## 후속 세 패치 및 현재 잔여 범위

| ID·패치 | 변경 경로 | 수정 범위와 결과 |
|---|---|---|
| D2 `office-definitive-rejection.patch` | `apps/desktop/pet/main/pet-hub-client.js`; `apps/desktop/pet/renderer/model/envelope-view.js`; `apps/desktop/pet/renderer/modes/office.js`; 신규 `apps/desktop/pet/renderer/office-recovery.test.js` | 정확한 turn POST/409 계약에서 `meeting-revision-changed`·`meeting-closed` 두 확정 미수락만 구별해 pending을 해제하고 입력을 보존한다. 새로고침과 명시적 재전송이 필요하며 자동 생성은 없다. 신규 13회귀 **10 pass/3 fail → 13 pass**, 관련 선택 **49 pass**. |
| D3 `desktop-queued-cancellation.patch` | `apps/desktop/pet/main/pet-hub.js`; 신규 `apps/desktop/pet/main/pet-hub-cancellation.test.js` | 준비 대기부터 전송을 예약하고 취소 ticket을 무효화한다. 취소된 준비 요청의 POST를 막고 이전 요청이 새 요청의 상태를 해제하지 못하게 한다. 신규 8회귀 **4 pass/4 fail → 8 pass**, 관련 **61 pass**; O1+D3 Desktop **384 pass/3 skip**. |
| S2 `session-snapshot-consistency.patch` | `apps/desktop/hub-session-bridge.js`; 신규 `apps/desktop/hub-session-snapshot.test.js` | 명시적 로그아웃과 이전 유효 쿠키를 함께 반환하지 않는다. origin별 revision으로 최대 한 번 재조회하고, 진행 중 쿠키 쓰기·반복 변경은 기존 `rejected` 응답으로 종료한다. 겹친 쓰기 소유권과 실패 후 정리도 확인했다. 신규 8회귀 **1 pass/7 fail → 8 pass**, S2만 적용한 Desktop **380 pass/3 skip**. |

D2의 두 코드가 turn claim 전 거절임을 실제 service→HTTP 흐름과 주입 RPC로 확인한 후속 Hub 계약 시험은 **6 pass**다. `persisted:false`만으로 미실행을 추론하지 않으며, ID 재사용·일반 409·timeout·응답 유실·preview·unknown·모순된 본문은 pending을 유지한다. 과거에 저장된 일반 pending을 GET만 보고 해제하지도 않는다. 모든 409 잠금이나 불확실한 결과 복구가 해결된 것은 아니다.

D3는 전송 전 취소 및 클라이언트 진행 중 abort에 관한 수정이다. 이미 서버에서 실행한 모델 작업의 중단은 보장하지 않는다. 초기 준비 Promise가 끝없이 대기하면 취소된 호출의 Promise도 즉시 끝나지 않지만 이후 준비 완료 시 POST는 차단한다. 준비 중 예약은 기존 `chatSession().busy/busyWith` UI에 노출되지 않는다.

S2는 JS snapshot 일관성만 수정한다. signed-out 상태의 디스크 지속, 실제 Keychain 삭제, auth 정책, descriptor 수명주기는 바꾸지 않았다. 검토 중 발견한 지연 `cookies.set` 구간을 pending-write reference count로 보완한 최종판의 SHA는 `f1464d…`이다. 초기 `0056f2…` 판은 전달 후보가 아니다.

| 남은 문제 | 증거와 다음 판단 경계 |
|---|---|
| 긴 회의 복원 | 7turn 233,947 bytes는 통과하고 8turn 267,322 bytes는 Hub200/ready 후 Desktop 상한 262,144 bytes에 걸린다. 8turn 필수 원문만 **264,000 bytes**이므로 metadata 제거로 해결할 수 없다. 상한 인상·원문 절단 없이 공통 페이지네이션 계약이 필요하다. 새 Hub 수정은 만들지 않았다. |
| 영구 `running/unknown` 복구 | 현 API에 cancel/recover가 없고 자동 재생성은 중복 위험이 있다. 후속 패치도 이를 자동 해제하지 않는다. |
| 재시작 후 로그아웃 의도 유실 | 메모리 signedOut Set이 사라진다. native가 로그아웃을 못 봤고 Keychain 자격이 남았을 때의 재로그인 가능성은 조건부 소스 분석이다. 실제 Mac 재로그인 성공을 관찰한 것은 아니다. |
| descriptor 교체/종료 경합 | 겹친 lifecycle 주입으로 새 descriptor가 구 close에 의해 사라지는 순서를 재현했다. 정상 single-instance 흐름에서 가능한지는 미확인이다. |
| 목록·버전 호환 | Native 목록 첫 20개 이후 cursor 노출 없음. 알려진 API 버전은 정확 비교하며 모르는 버전은 실패한다. 운영 구버전 앱 조합을 인증하지 않았다. NodeNext 선언 상대 import 오류 5건은 기존 상태이며 현재 Bundler typecheck/build 통과와 구분한다. |

## 누적 적용·최종 시험

별도 `followup-validation`에서 정확한 후보에 **O1 → O2 → O3 → D2 → D3 → S2** 순서로 적용했다. D3는 O1 이후의 delta다. 다른 다섯 개는 원본 후보에도 각각 적용 가능하지만, 재현은 아래 지정 순서를 따른다. 전체 누적 patch는 13파일/54,494 bytes이며 원본 후보 대상 `git apply --check` exit 0이다.

| 최종 검사 | 결과 | 증거 |
|---|---|---|
| Desktop 전체 `npm --workspace @com-moon/desktop test` | **408 total / 405 pass / 0 fail / 3 skip**, exit 0 | `evidence/followup/combined-desktop.tap` |
| `npm run lint` | source syntax guard 1780파일/0 issues, exit 0; 의미·스타일 검사는 아님 | `evidence/followup/combined-lint.log` |
| 누적 적용·공백·원본 보존 | 모두 통과; 원본 후보·main clean, 입력·최초 패치·최초 ZIP SHA 동일 | `PATCH-MANIFEST.json`, `evidence/followup/combined-patch-validation.json` |
| 독립 소스 검토 | 후속 세 패치의 명시 범위에서 새 차단 결함 없음 | `evidence/followup-independent-review.ko.md` |

후속 수정은 Desktop JavaScript 경로에 한정되어 루트 전체 시험·웹 build를 반복하지 않았다. 위 원본 5576 pass나 최초 세 패치의 Hub build 결과를 최종 여섯 패치 전체 시험 결과처럼 표시하지 않는다. Swift 후보는 여전히 실행 미검증이다.

`patches/`에는 회귀 시험을 포함한 여섯 개 개별 패치와, 동일 변경을 합친 `all-six-candidate.patch`가 있다. 누적 patch와 개별 여섯 개는 **둘 중 하나만** 적용한다. `source-only/`는 대화·검토용 제품 코드만 뽑은 작은 동일 변경으로 시험 파일이 빠져 있다. 회귀 검증용 전달본은 `patches/`다. 모든 개별/full/source-only SHA256과 정확한 경로는 `PATCH-MANIFEST.json`에 있다.

| ID | 개별 전체 패치 SHA256 |
|---|---|
| O1 | `250da48139a7b1c4983766ed24bd7e1cfbbf3bc33b8d991d681d04b87ed4afcb` |
| O2 | `a6aeb9888c8273ae78b9aa40151fe8db36f7b3030f94e6eca4e11f2c3a5bfd23` |
| O3 | `75032dbd1045e6d63ebc502fec279761d249f2b524cff8c85906361140a32d31` |
| D2 | `c871bb9381e8ce56d22bd5bcb461dbd6d88680c1263b1991e69bb026236307a8` |
| D3 | `a466754719e967b0386fe9f3e99a37471dbe4088275d649c1ac9b117d98caa7d` |
| S2 | `f1464d693def09901a94594aa867c1d87bd30c6ded170b3d0825a4638d9960c8` |
| 전체 누적 | `cbe38eb1153836d00f2fdd81894b4ac3278fb369aa7761dffa64e96e978ecf10` |

## 수행 제한과 Library 차단

원격 Git 쓰기·PR 변경·main 병합·배포·실사용 DB/Hub·모델 호출·Claude API 호출·실제 호스트 등록·보안 설정 변경·사용자 기존 파일 삭제를 하지 않았다. 예약 100건 경계 수정은 다른 담당 범위로 유지했다. Windows hotkey/login/Acrylic/DWM, Mac Swift/Keychain/Metal/native, 설치·업데이트·실기 왕복은 미검증이다. 과거 거부된 native/compiler·브라우저 경로를 재시도하거나 우회하지 않았다.

**Library 저장은 완료되지 않았다.** 최초 prepared-upload helper가 `tools/list` 인증 단계 HTTP 401로 실패했다. 후속에서는 허용된 같은 `HostedAppsClient` endpoint/auth 경로로 2026-10-19 11:59:46 UTC 읽기 전용 `tools/list`만 확인했으며 다시 401이었다. 대상은 완성된 보고서·테스트·패치 파일의 신규 Library 저장이다. 이번 확인은 upload를 요청하지 않았고, 기존 시도도 업로드 세션 생성·바이트 전송·최종 저장 전에 실패했다. 따라서 쓰기 결과가 불확실한 상황이 아니라 **인증 차단으로 미실행** 상태다. 자동 승인 심사 거절은 아니며 다른 인증·endpoint·직접 업로드로 우회하지 않았다.

로컬 보고서, 여섯 패치, 작은 source-only 패치, 테스트 로그와 SHA256 manifest를 대화에서 직접 전달한다. 같은 업로드 인증이 복구된 세션에서 Library 저장만 남아 있다. 입력 Library identity는 변경되지 않았다.
