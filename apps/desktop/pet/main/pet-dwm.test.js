'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./pet-dwm');

const handle = (value) => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
};
const fakeWindow = (hwnd, destroyed = false) => ({ isDestroyed: () => destroyed, getNativeWindowHandle: () => handle(hwnd) });

test('HWND 버퍼 → 10진 문자열', () => {
  assert.equal(D.hwndFromBuffer(handle(7932692)), '7932692');
  const small = Buffer.alloc(4);
  small.writeUInt32LE(4660);
  assert.equal(D.hwndFromBuffer(small), '4660');
  assert.equal(D.hwndFromBuffer(Buffer.alloc(2)), null);
  assert.equal(D.hwndFromBuffer('123'), null);
});

test('스크립트: 두 속성(33=2, 34=0xFFFFFFFE)을 창마다, 숫자 HWND만', () => {
  const script = D.buildDwmScript(['111', '222', 'x; Remove-Item']);
  assert.match(script, /foreach \(\$h in @\(111,222\)\)/);
  assert.match(script, /Set\(\[long\]\$h, 33, \[uint32\]2\)/);
  assert.match(script, /Set\(\[long\]\$h, 34, \[uint32\]4294967294\)/);
  assert.doesNotMatch(script, /Remove-Item/);
  assert.equal(D.buildDwmScript([]), null);
  assert.equal(D.DWMWA_COLOR_NONE, 0xFFFFFFFE);
});

test('명령: 숨긴 powershell, EncodedCommand(UTF-16LE)', () => {
  const command = D.buildDwmCommand(['42']);
  assert.equal(command.file, 'powershell.exe');
  assert.deepEqual(command.args.slice(0, 5), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand']);
  assert.equal(Buffer.from(command.args[5], 'base64').toString('utf16le'), D.buildDwmScript(['42']));
  assert.equal(command.options.windowsHide, true);
  assert.ok(command.options.timeout > 0);
  assert.equal(D.buildDwmCommand(['nope']), null);
});

test('출력 해석: HRESULT 0만 성공', () => {
  const parsed = D.parseDwmOutput('dwm 111 corner=0 border=0\r\ndwm 222 corner=0 border=-2147024809\nnoise');
  assert.deepEqual(parsed['111'], { corner: 0, border: 0, ok: true });
  assert.equal(parsed['222'].ok, false);
  assert.deepEqual(D.parseDwmOutput(''), {});
});

test('적용: 한 번의 자식 프로세스, 실패해도 resolve', async () => {
  const calls = [];
  const ok = await D.applyGlassFrame([fakeWindow(111), fakeWindow(222), fakeWindow(333, true)], {
    platform: 'win32',
    execFile: (file, args, options, done) => {
      calls.push({ file, args, options });
      done(null, 'dwm 111 corner=0 border=0\ndwm 222 corner=0 border=0\n');
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(ok.ok, true);
  assert.deepEqual(Object.keys(ok.applied).sort(), ['111', '222']);

  const failed = await D.applyGlassFrame([fakeWindow(111)], {
    platform: 'win32',
    execFile: (_f, _a, _o, done) => done(new Error('powershell missing'), ''),
  });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /powershell missing/);

  const thrown = await D.applyGlassFrame([fakeWindow(111)], {
    platform: 'win32',
    execFile: () => { throw new Error('spawn EPERM'); },
  });
  assert.equal(thrown.ok, false);

  const skipped = await D.applyGlassFrame([fakeWindow(111)], { platform: 'darwin', execFile: () => assert.fail('no spawn') });
  assert.equal(skipped.error, 'platform');
});
