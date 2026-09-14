// 사이드바 스코프(전체 · ClassIn · 개인)가 Revenue 표면에 도달하는 유일한 통로는
// `?scope=` 쿼리다. pathname은 그대로이고 hub-app은 `key={path}`(pathname만)로 페이지를
// 키잉하므로 쿼리만 바뀌면 페이지가 리마운트되지 않는다. 그래서 마운트 1회 지연
// 초기화로 window.location.search를 읽던 이전 구현은 스코프를 바꿔도 목록이 그대로였다
// (2026-09-11). 이 모듈은 규칙 하나를 소유한다: 쿼리가 "바뀐 순간에만" 툴바 필터를 다시
// 맞추고, 그 사이 운영자가 직접 고른 값은 건드리지 않는다.

// ClassIn 스코프는 별도 라우트(dashboard/classin/*)로 가므로 이 표면에 쿼리로 오지
// 않는다. 손으로 붙여 넣어 들어오더라도 조용히 company로 좁히지 않는다 — workspace
// 필터와 이중으로 걸려 keyword rescue된 행이 사라지기 때문이다.
const SCOPE_QUERY_FILTER = { personal: 'personal' };

function normalizeQueryScope(queryScope) {
  return queryScope ? String(queryScope) : null;
}

export function scopeFilterForQuery(queryScope) {
  return SCOPE_QUERY_FILTER[normalizeQueryScope(queryScope)] || 'all';
}

export function resolveScopeFilter({ queryScope, previousQueryScope, current }) {
  if (normalizeQueryScope(previousQueryScope) === normalizeQueryScope(queryScope)) {
    return current === undefined ? scopeFilterForQuery(queryScope) : current;
  }
  return scopeFilterForQuery(queryScope);
}
