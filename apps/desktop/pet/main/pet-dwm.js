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

// ── 포커스를 잃은 Acrylic 창의 블러 유지 ─────────────────────────────────
// 실측(2026-09-27, 줄무늬 배경 위 네 창 비교): 초점을 받았다가 잃은 Acrylic 창은 DWM 이 재질을 끄고 단색으로 그린다.
// 한 번도 활성이 아니었던 창(말풍선, showInactive)은 블러가 남는다. 초점을 잃은 창에 WM_NCACTIVATE(TRUE)를 보내면
// DWM 이 활성 모양으로 다시 그려 블러가 돌아오고, 키보드 초점은 옮기지 않는다. 숨긴 PowerShell 하나를 처음 필요할 때
// 띄워 두고 표준 입력으로 받은 HWND(숫자만)에 PostMessage 한다 — 창이 초점을 잃을 때마다 새 프로세스를 띄우지 않는다.
const WM_NCACTIVATE = 0x0086;

function buildKeeperScript() {
  return [
    "$ErrorActionPreference = 'Continue'",
    'Add-Type -TypeDefinition @"',
    'using System; using System.Runtime.InteropServices;',
    'public static class MoonlightPetActivation {',
    '  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);',
    `  public static bool Keep(long hwnd) { return PostMessage(new IntPtr(hwnd), ${WM_NCACTIVATE}, new IntPtr(1), IntPtr.Zero); }`,
    '}',
    '"@',
    'while ($null -ne ($line = [Console]::In.ReadLine())) {',
    "  if ($line -match '^[0-9]+$') { [void][MoonlightPetActivation]::Keep([long]$line) }",
    '}',
  ].join('\n');
}

function buildKeeperCommand() {
  return {
    file: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(buildKeeperScript(), 'utf16le').toString('base64')],
    options: { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] },
  };
}

// keep(win) → 보냈으면 true. Windows 가 아니거나 도우미를 띄우지 못하면 false(블러 대신 단색일 뿐 기능은 그대로).
function createActivationKeeper(options = {}) {
  const spawn = options.spawn || require('node:child_process').spawn;
  const platform = options.platform || process.platform;
  const log = options.log || (() => {});
  let child = null;
  let failed = false;

  function ensure() {
    if (child || failed) return child;
    const command = buildKeeperCommand();
    try {
      child = spawn(command.file, command.args, command.options);
    } catch (error) {
      failed = true;
      log(`pet:dwm keeper spawn failed ${error && error.message}`);
      return null;
    }
    const current = child;
    current.on('error', (error) => {
      failed = true;
      log(`pet:dwm keeper failed ${error && error.message}`);
      if (child === current) child = null;
    });
    current.on('exit', () => { if (child === current) child = null; });
    if (current.stdin) current.stdin.on('error', () => {});
    return current;
  }

  return {
    keep(win) {
      if (platform !== 'win32' || !win || win.isDestroyed() || !win.isVisible()) return false;
      let hwnd = null;
      try {
        hwnd = hwndFromBuffer(win.getNativeWindowHandle());
      } catch {
        hwnd = null;
      }
      if (!hwnd || !/^[0-9]+$/.test(hwnd)) return false;
      const proc = ensure();
      if (!proc || !proc.stdin || proc.stdin.destroyed) return false;
      proc.stdin.write(`${hwnd}\n`);
      return true;
    },
    dispose() {
      const proc = child;
      child = null;
      if (!proc) return;
      try { proc.stdin.end(); } catch { /* 이미 닫힘 */ }
      try { proc.kill(); } catch { /* 이미 끝남 */ }
    },
    get running() { return child !== null; },
  };
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
  WM_NCACTIVATE,
  buildKeeperScript,
  buildKeeperCommand,
  createActivationKeeper,
};
