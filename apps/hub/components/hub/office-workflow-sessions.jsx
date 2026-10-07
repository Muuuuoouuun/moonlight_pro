"use client";

import React from 'react';

// 오피스 업무 패널의 초안·요청 상태를 화면 전환 사이에 남기는 셸 쪽 틀.
// 저장소 자체(createOfficeWorkflowSessions)는 계약·요청 클라이언트를 함께 끌고 오므로, 셸은 빈 상자만 들고
// 있다가 첫 패널이 열릴 때 그 패널이 저장소를 채운다 — 첫 화면 번들에 오피스 모듈이 실리지 않는다.
const SessionsHolder = React.createContext(null);

export function OfficeWorkflowSessionProvider({ children }) {
  const [holder] = React.useState(() => ({ store: null }));
  React.useEffect(() => {
    const warn = (event) => {
      if (holder.store?.hasDrafts()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [holder]);
  return <SessionsHolder.Provider value={holder}>{children}</SessionsHolder.Provider>;
}

// 셸 안이면 셸이 들고 있는 하나의 저장소, 셸 밖(테스트·단독 렌더)이면 null.
export function useSharedOfficeWorkflowSessions(create) {
  const holder = React.useContext(SessionsHolder);
  if (!holder) return null;
  if (!holder.store) holder.store = create();
  return holder.store;
}
