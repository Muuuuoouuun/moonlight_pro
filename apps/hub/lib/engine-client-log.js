// Engine 거절 이유(`detail`)는 서비스 키 같은 비공개 값을 담을 수 있어 브라우저로는 절대
// 내보내지 않는다(각 client의 publicData 필터). 대신 서버 로그에만 남긴다 — 이게 없으면
// 운영자 화면에 `http-400` 하나만 뜨고 원인(예: 스키마에 없는 컬럼)을 알 길이 없다.
// 2026-09-20 `tasks.description` 부재 진단이 Engine 직통 호출을 손으로 재현해야만
// 가능했던 이유이므로, 쓰기 client는 거절을 조용히 삼키지 않는다.
export function logEngineRejection(logger, scope, command, status, data) {
  logger(`[hub/${scope}] engine rejected command`, {
    action: command?.action ?? null,
    status,
    error: data?.error ?? null,
    detail: data?.detail ?? null,
  });
}
