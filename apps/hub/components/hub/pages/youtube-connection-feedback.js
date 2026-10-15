const CALLBACK_MESSAGES = {
  connected: 'YouTube 연결 요청이 완료되었습니다. 아래 저장된 채널 상태를 확인하세요.',
  'oauth-denied': 'Google 승인이 취소되었거나 거부되었습니다. YouTube 연결을 저장하지 않았습니다.',
  'channel-mismatch': '선택한 YouTube 채널이 재연결 대상과 다릅니다. 대상 채널을 선택해 다시 연결하세요.',
  'connect-failed': 'YouTube 연결을 저장하지 못했습니다. 아래 상태를 확인한 뒤 다시 연결하세요.',
  'invalid-state': 'YouTube 연결 요청이 만료되었거나 유효하지 않습니다. 연결을 다시 시작하세요.',
  'missing-code': 'Google 승인 결과를 받지 못했습니다. 연결을 다시 시작하세요.',
  'youtube-offline-grant-missing': 'YouTube 갱신 권한을 받지 못했습니다. Google에서 다시 승인하세요.',
  'youtube-required-scope-missing': '필요한 YouTube 권한이 승인되지 않았습니다. 요청한 권한을 확인해 다시 승인하세요.',
  'youtube-channel-not-found': '승인한 계정에서 YouTube 채널을 찾지 못했습니다. 대상 채널을 확인하세요.',
  'invalid-brand': '연결할 브랜드를 확인하지 못했습니다. 브랜드를 확인한 뒤 다시 연결하세요.',
  'missing-config': 'YouTube 연결 설정이 준비되지 않았습니다. 운영 설정을 확인하세요.',
  'missing-workspace': '연결할 작업 공간을 확인하지 못했습니다. 운영 설정을 확인하세요.',
};

/** Consume only the callback marker; never reflect arbitrary query text. */
export function readYouTubeConnectionFeedback(href) {
  const url = new URL(href);
  if (!url.searchParams.has('youtube')) return null;
  const code = url.searchParams.get('youtube');
  const message = Object.hasOwn(CALLBACK_MESSAGES, code)
    ? CALLBACK_MESSAGES[code]
    : 'YouTube 연결 결과를 확인하지 못했습니다. 아래 저장된 채널 상태를 확인하세요.';
  url.searchParams.delete('youtube');
  return { message, returnPath: `${url.pathname}${url.search}${url.hash}` };
}
