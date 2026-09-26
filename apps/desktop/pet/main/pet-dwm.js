'use strict';
// Acrylic 유리 창의 DWM 속성 두 가지 — 운영자 결정(2026-09-26, 재질 A).
//   DWMWA_WINDOW_CORNER_PREFERENCE(33) = 2 (DWMWCP_ROUND)  thickFrame:false로 사라진 둥근 모서리를 되살린다
//   DWMWA_BORDER_COLOR(34) = 0xFFFFFFFE (DWMWA_COLOR_NONE)  DWM 테두리 선을 지워 CSS 림만 보이게 한다
// 이 둘이 있어야 포커스를 잃어도 블러가 살아 있고 창 크기가 요청과 정확히 같다(목업 하네스 실측).
// Electron에는 이 API가 없어 숨긴 PowerShell 자식이 P/Invoke로 부른다. 창마다 한 번, 실패해도 조용히 넘어간다
// (모서리가 각지고 얇은 테두리가 보일 뿐 기능은 그대로다).
const { execFile } = require('node:child_process');

const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
const DWMWA_BORDER_COLOR = 34;
const DWMWCP_ROUND = 2;
const DWMWA_COLOR_NONE = 0xfffffffe;
const TIMEOUT_MS = 20000;

// getNativeWindowHandle() 버퍼 → HWND 10진 문자열. 64비트는 8바이트, 32비트는 4바이트.
function hwndFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 8) return buffer.readBigUInt64LE(0).toString();
  if (buffer.length >= 4) return String(buffer.readUInt32LE(0));
  return null;
}

// 숫자만 들어가는 스크립트 — 외부 입력이 명령에 섞이지 않는다.
function buildDwmScript(hwnds, options = {}) {
  const corner = Number.isInteger(options.corner) ? options.corner : DWMWCP_ROUND;
  const border = Number.isInteger(options.border) ? options.border : DWMWA_COLOR_NONE;
  const list = hwnds.filter((h) => /^[0-9]+$/.test(String(h)));
  if (!list.length) return null;
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -TypeDefinition @"',
    'using System; using System.Runtime.InteropServices;',
    'public static class MoonlightPetDwm {',
    '  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref uint value, int size);',
    '  public static int Set(long hwnd, int attr, uint value) { uint v = value; return DwmSetWindowAttribute(new IntPtr(hwnd), attr, ref v, 4); }',
    '}',
    '"@',
    `foreach ($h in @(${list.join(',')})) {`,
    `  $c = [MoonlightPetDwm]::Set([long]$h, ${DWMWA_WINDOW_CORNER_PREFERENCE}, [uint32]${corner})`,
    `  $b = [MoonlightPetDwm]::Set([long]$h, ${DWMWA_BORDER_COLOR}, [uint32]${border})`,
    '  "dwm $h corner=$c border=$b"',
    '}',
  ].join('\n');
}

// powershell.exe 인자. 스크립트는 -EncodedCommand(UTF-16LE base64)로 넘겨 따옴표 문제를 없앤다.
function buildDwmCommand(hwnds, options = {}) {
  const script = buildDwmScript(hwnds, options);
  if (!script) return null;
  return {
    file: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    options: { windowsHide: true, timeout: TIMEOUT_MS, encoding: 'utf8' },
  };
}

// "dwm <hwnd> corner=<hr> border=<hr>" 줄 → { [hwnd]: { corner, border, ok } }. HRESULT 0이 성공.
function parseDwmOutput(text) {
  const result = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^dwm (\d+) corner=(-?\d+) border=(-?\d+)/);
    if (m) {
      const corner = Number(m[2]);
      const border = Number(m[3]);
      result[m[1]] = { corner, border, ok: corner === 0 && border === 0 };
    }
  }
  return result;
}

// 창 여러 개에 한 번에 적용한다. 항상 resolve — { ok, applied, error? }. Windows가 아니면 건너뛴다.
function applyGlassFrame(windows, options = {}) {
  const run = options.execFile || execFile;
  const platform = options.platform || process.platform;
  if (platform !== 'win32') return Promise.resolve({ ok: false, applied: {}, error: 'platform' });
  const hwnds = [];
  for (const win of windows) {
    try {
      if (win && !win.isDestroyed()) {
        const hwnd = hwndFromBuffer(win.getNativeWindowHandle());
        if (hwnd) hwnds.push(hwnd);
      }
    } catch { /* 창이 사라졌으면 건너뛴다 */ }
  }
  const command = buildDwmCommand(hwnds, options);
  if (!command) return Promise.resolve({ ok: false, applied: {}, error: 'no-window' });
  return new Promise((resolve) => {
    try {
      run(command.file, command.args, command.options, (error, stdout) => {
        const applied = parseDwmOutput(stdout);
        const ok = !error && hwnds.every((h) => applied[h] && applied[h].ok);
        resolve({ ok, applied, error: error ? String(error.message || error) : undefined });
      });
    } catch (error) {
      resolve({ ok: false, applied: {}, error: String(error && error.message ? error.message : error) });
    }
  });
}

module.exports = {
  DWMWA_WINDOW_CORNER_PREFERENCE,
  DWMWA_BORDER_COLOR,
  DWMWCP_ROUND,
  DWMWA_COLOR_NONE,
  hwndFromBuffer,
  buildDwmScript,
  buildDwmCommand,
  parseDwmOutput,
  applyGlassFrame,
};
