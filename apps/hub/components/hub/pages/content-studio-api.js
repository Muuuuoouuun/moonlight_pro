// Studio 명령 전송 — next/navigation 등 React 훅 의존 없이 두어 AI 패널을 단독으로 렌더·테스트할 수 있게 한다.
export async function postStudio(path, body) {
  const response = await fetch('/api/hub/content/' + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(path === 'transform' ? 65000 : 20000),
  });
  const result = await response.json();
  if (!result || typeof result.status !== 'string') throw new Error('서버 응답을 확인하지 못했습니다. 같은 요청으로 다시 확인해주세요.');
  return result;
}
