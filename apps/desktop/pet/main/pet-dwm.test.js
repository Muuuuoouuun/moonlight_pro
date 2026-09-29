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

test('초점을 잃은 Acrylic 창: 도우미 하나를 처음에만 띄우고 HWND 를 줄마다 보낸다(WM_NCACTIVATE)', () => {
  const { EventEmitter } = require('node:events');
  const spawned = [];
  const spawn = (file, args, options) => {
    const child = new EventEmitter();
    child.written = [];
    child.stdin = new EventEmitter();
    child.stdin.write = (line) => { child.written.push(line); return true; };
    child.stdin.end = () => { child.ended = true; };
    child.kill = () => { child.killed = true; };
    spawned.push({ file, args, options, child });
    return child;
  };
  const win = (n, visible = true) => {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(BigInt(n));
    return { isDestroyed: () => false, isVisible: () => visible, getNativeWindowHandle: () => buffer };
  };
  const keeper = D.createActivationKeeper({ spawn, platform: 'win32' });
  assert.equal(keeper.keep(win(4242)), true);
  assert.equal(keeper.keep(win(77)), true);
  assert.equal(keeper.keep(win(5, false)), false, '숨은 창은 건너뛴다');
  assert.equal(spawned.length, 1, '도우미는 한 번만');
  assert.equal(spawned[0].file, 'powershell.exe');
  assert.equal(spawned[0].options.windowsHide, true);
  assert.deepEqual(spawned[0].child.written, ['4242\n', '77\n']);
  const script = Buffer.from(spawned[0].args.at(-1), 'base64').toString('utf16le');
  assert.match(script, /PostMessage/);
  assert.ok(script.includes(`${D.WM_NCACTIVATE}, new IntPtr(1)`), 'WM_NCACTIVATE(TRUE)');
  spawned[0].child.emit('exit', 0);
  assert.equal(keeper.running, false);
  keeper.keep(win(9));
  assert.equal(spawned.length, 2, '끝났으면 다음에 다시 띄운다');
  keeper.dispose();
  assert.equal(spawned[1].child.killed, true);
  assert.equal(D.createActivationKeeper({ spawn, platform: 'darwin' }).keep(win(1)), false, 'Windows 가 아니면 아무것도 하지 않는다');
  const broken = D.createActivationKeeper({ spawn: () => { throw new Error('ENOENT'); }, platform: 'win32' });
  assert.equal(broken.keep(win(1)), false);
});
