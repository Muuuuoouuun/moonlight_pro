// 허브 주소 설정 화면. 검증은 메인 프로세스(hub-url.js)가 최종 판정한다.
'use strict';

const REASONS = {
  empty: '주소를 넣어 주세요.',
  invalid: 'https://로 시작하는 전체 주소를 넣어 주세요.',
  scheme: 'https 주소만 됩니다. http는 localhost·127.0.0.1만 받습니다.',
  credentials: '주소에 아이디·비밀번호를 넣지 마세요.',
};

const form = document.getElementById('form');
const input = document.getElementById('hub-url');
const error = document.getElementById('error');
const failure = document.getElementById('failure');
const back = document.getElementById('back');
const bridge = window.moonlight;

function showError(reason) {
  error.textContent = REASONS[reason] || REASONS.invalid;
  error.hidden = false;
  input.setAttribute('aria-invalid', 'true');
}

function clearError() {
  error.hidden = true;
  input.removeAttribute('aria-invalid');
}

const params = new URLSearchParams(window.location.search);
if (params.get('failed')) {
  failure.textContent = `허브를 열지 못했습니다 — ${params.get('failed')} (${params.get('reason') || '연결 실패'}). 주소를 확인하거나 네트워크를 확인한 뒤 다시 저장하세요.`;
  failure.hidden = false;
}

bridge.getSettings().then(({ hubUrl }) => {
  if (hubUrl) {
    input.value = hubUrl;
    back.hidden = false;
  }
  input.focus();
});

input.addEventListener('input', clearError);

back.addEventListener('click', async () => {
  const { hubUrl } = await bridge.getSettings();
  if (hubUrl) bridge.setSettings({ hubUrl });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = '여는 중…';
  const result = await bridge.setSettings({ hubUrl: input.value });
  if (!result.ok) {
    submit.disabled = false;
    submit.textContent = '저장';
    showError(result.reason);
  }
});
