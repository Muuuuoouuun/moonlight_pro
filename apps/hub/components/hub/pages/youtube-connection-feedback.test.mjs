import assert from 'node:assert/strict';
import test from 'node:test';
import { readYouTubeConnectionFeedback } from './youtube-connection-feedback.js';

test('denied approval, wrong channel, and save failure each explain the outcome', () => {
  for (const [code, expected] of [
    ['oauth-denied', /취소되었거나 거부/],
    ['channel-mismatch', /재연결 대상과 다릅니다/],
    ['connect-failed', /저장하지 못했습니다/],
  ]) {
    assert.match(readYouTubeConnectionFeedback(`https://moonlight.example/dashboard/settings?youtube=${code}`).message, expected);
  }
});

test('callback consumption preserves unrelated query values and hash', () => {
  const result = readYouTubeConnectionFeedback('https://moonlight.example/dashboard/settings?tab=social&youtube=connected&brand=gore#connections');
  assert.match(result.message, /저장된 채널 상태를 확인/);
  assert.equal(result.returnPath, '/dashboard/settings?tab=social&brand=gore#connections');
  assert.equal(readYouTubeConnectionFeedback(`https://moonlight.example${result.returnPath}`), null);
});

test('unknown callback values never become displayed messages', () => {
  for (const code of ['<script>untrusted</script>', 'constructor', '__proto__', '']) {
    const result = readYouTubeConnectionFeedback(`https://moonlight.example/dashboard/settings?youtube=${encodeURIComponent(code)}&youtube=connected`);
    assert.equal(result.message, 'YouTube 연결 결과를 확인하지 못했습니다. 아래 저장된 채널 상태를 확인하세요.');
    assert.equal(result.returnPath, '/dashboard/settings');
  }
});

test('ordinary settings navigation has no callback feedback', () => {
  assert.equal(readYouTubeConnectionFeedback('https://moonlight.example/dashboard/settings?tab=social#connections'), null);
});
