# Windows/Mac·Hub 여섯 패치 전달

이 디렉터리는 독립 Linux 감사에서 작성한 여섯 패치, 원본 보고서·증거, Git bundle을 그대로 보존한다. 제품 코드 변경은 별도 커밋 `a48ed295ca009d3d95dbeb73ec5f9e0b9d0be405`에 있으며 **13파일만 변경**한다. 이 문서는 새 제품 수정이 아닌 전달 기록이다.

## 정확한 기준과 선택 방법

- 코드 커밋의 부모: Office `12103a76eadef632a57f0da151487d8076fcecdd`.
- 검토 PR의 base: `codex/office-connection-20261002`. 전달 branch: `codex/windows-mac-hub-handoff-20261019`.
- 원본 누적 patch의 기준: `67eb1d9b316843f5acd70de513d5a7b8d823bfdc`.
- 위 두 기준의 패치 대상 13경로는 모두 preimage가 같다. 기존 파일 8개의 Git blob/mode가 같고 신규 시험 5개는 양쪽 모두 없다. 근거는 `validation/office-base-preimage-equivalence.json`이다.
- Office 기준에 원본 patch를 수정 없이 적용한 결과 13파일도 이전 검증본과 모두 같다. 근거는 `validation/office-applied-source-equivalence.json`이다.
- 주 통합 작업의 최신 후보 `7ba34953b1dd6b580eb7f3aa08dab9582c3a017f`는 2026-10-19 12:53 UTC 원격 87개 branch head에 없었고 commit 조회가 404였다. 로컬 객체도 없어 이 후보와의 ancestry·적용 호환성·시험은 미검증이다.

주 통합 작업은 코드 커밋만 선택하거나 원본 누적 patch를 적용할 수 있다. 개별 여섯 패치, 누적 patch, 코드 커밋을 중복 적용하지 않는다. 개별 순서는 O1 → O2 → O3 → D2 → D3 → S2이며 D3는 O1 뒤의 delta다. 최신 통합 후보에서 적용·충돌 검사와 시험을 수행한 뒤 통합 여부를 결정한다. 이 전달 작업은 main 병합을 수행하지 않는다.

## 보존한 파일

- `patches/`: 회귀 시험 포함 여섯 개 개별 patch 및 `all-six-candidate.patch`.
- `PATCH-MANIFEST.json`: 최초 manifest를 변경하지 않고 복사했다. 검증 시점의 후보·결과·Library 실패 상태를 담는다.
- `all-six-candidate.patch`: **54,494 bytes**, SHA256 `cbe38eb1153836d00f2fdd81894b4ac3278fb369aa7761dffa64e96e978ecf10`.
- `verified-six-patches.bundle`: 코드 커밋 하나를 담은 증분 bundle. prerequisite는 Office `12103a76eadef632a57f0da151487d8076fcecdd`이다. SHA256 `474dbf779cadbd6c02a4ee0d75493d81286ef67cae5a321ce94538accfa1fec2`, 14,703 bytes, `git bundle verify` 통과.
- `Moonlight-Windows-Mac-Hub-followup-2026-10-19.ko.md`: 이전 한국어 종합 보고서 원본이다. 그 안의 “커밋·원격 쓰기 없음”은 당시 감사 시점의 기록이며, 이후 승인된 이번 전달 PR은 이 문서로 별도 기록한다.
- `Moonlight-Windows-Mac-Hub-followup-evidence-2026-10-19.zip`: 이전 증거 ZIP 원본이다. SHA256 `237df3bf4b91ef248c1dc0942d6db1306de90effdb9a579b2ea26a828550c4d5`, 764,811 bytes. 기존 보고서·세 패치와 후속 시험까지 포함한다.
- `validation/`: Office 기준의 새 실행 로그, 원본/적용 결과 동일성, Library 인증 확인.
- `assessments/`: 긴 회의·unknown·재시작 로그아웃의 남은 계약 평가. 기존 증거를 읽어 정리했으며 새 구현은 없다.
- `FILE-SHA256.tsv`: 이 디렉터리의 전달 파일 해시와 바이트 수.

## 실제 검증과 한계

Office 기준에 여섯 패치를 적용한 뒤 Linux/Node24.19.0/npm11.9.0에서 실행했다. lockfile은 기존 clean 검증본과 같다.

| 검사 | 결과 |
|---|---|
| Desktop 전체 | 408 total / **405 pass / 0 fail / 3 skip** |
| Office 및 native 소스 wiring 선택 시험 | 192 total / **190 pass / 0 fail / 2 skip** |
| source syntax guard | **1752파일 / 0 issues**, exit 0; 의미·스타일 검사는 아님 |
| 원본 누적 patch 적용·공백 검사 | exit 0 |
| Git bundle verify | exit 0 |

이 Office 기준에서는 루트 전체 시험·웹 build·typecheck를 재실행하지 않았다. 이전 후보67의 전체 결과 5576 pass/3 main 기존 fail/34 skip 및 웹 build/typecheck 통과는 보존 보고서에 있으며, Office 기준의 전체 통과 결과로 바꾸어 해석하지 않는다.

Swift 패치는 소스·적용 검토 수준이며 컴파일과 새 Swift 회귀 실행은 아직 미검증이다. Node wiring 시험은 native 실행 증거가 아니다. 실제 Windows는 오프라인이며 Windows hotkey/login/Acrylic 및 Mac Keychain/Metal/native 성공을 주장하지 않는다. 긴 회의 페이지네이션, 영구 unknown 복구, 재시작 후 로그아웃 의도 지속, 조건부 descriptor 경합은 남아 있다. 재시작 로그아웃의 기존 실행 재현은 같은 Node 프로세스의 bridge 인스턴스 재생성이며 실제 앱/OS 재시작이 아니다.

## Library 및 승인 범위

2026-10-19 12:53:20 UTC 기존 `HostedAppsClient`의 동일 endpoint/auth 경로로 읽기 전용 `tools/list`를 확인했으나 HTTP401이었다. 이 확인은 upload를 요청하지 않았다. Library 업로드는 계속 미실행이며 별도 인증·endpoint·직접 업로드로 우회하지 않았다.

사용자가 후속 PR 진행을 승인하여 자기 검증 패치만 Office 기준 검토 브랜치·draft PR로 보존한다. 기존 main·Office branch를 갱신하거나 병합하지 않는다. 실사용 DB/Hub·Claude API·모델 호출·보안 설정 변경·이전 거부된 native/compiler 우회는 수행하지 않았다. CI가 보고하는 결과는 실제 확인된 상태만 별도로 전달한다.
