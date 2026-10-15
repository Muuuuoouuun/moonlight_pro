import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../prototypes/moonlight-pet-macos/Sources/MoonlightPetPreview/Views/HubConnectionContent.swift', import.meta.url), 'utf8');

// The Foundation suite exercises the actual connection/persistence boundary.
// These contracts keep the SwiftUI recovery path wired to that boundary on CI.
function bodyAfter(marker) {
  const markerIndex = source.indexOf(marker);
  assert.ok(markerIndex >= 0, `Missing ${marker}`);
  const start = source.indexOf('{', markerIndex);
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start + 1, index);
  }
  assert.fail(`Unclosed ${marker}`);
}

test('native login keeps credentials primary and address recovery collapsed initially', () => {
  const content = bodyAfter('var body: some View');
  assert.match(source, /@State private var showsAddressSettings = false/);
  assert.match(content, /TextField\("아이디", text: \$username\)/);
  assert.match(content, /SecureField\("비밀번호", text: \$password\)/);
  assert.match(content, /\.keyboardShortcut\(\.defaultAction\)/);
  assert.ok(content.indexOf('addressSettings') > content.indexOf('Button(action: connect)'));
  const settings = bodyAfter('private var addressSettings: some View');
  assert.match(settings, /DisclosureGroup\("Hub 주소 설정", isExpanded: \$showsAddressSettings\)/);
  assert.match(settings, /TextField\("https:\/\/…", text: \$address\)/);
});

test('editing or cancelling a native Hub address does not change the saved preference', () => {
  assert.match(source, /@State private var address = ""/);
  assert.match(source, /\.onAppear\s*\{\s*address = model\.hubBaseURL/);
  assert.match(source, /Button\("취소", action: done\)/);
  const settings = bodyAfter('private var addressSettings: some View');
  assert.match(settings, /Button\("운영 Hub 주소 사용"\)\s*\{\s*address = AppModel\.defaultHubURL/);
  assert.doesNotMatch(settings, /model\.hubBaseURL\s*=|saveHubURL\(|signIn\(/);
  assert.doesNotMatch(source, /text:\s*\$model\.hubBaseURL|@AppStorage/);
});

test('native login submits an address snapshot and updates the app only after authentication', () => {
  const submit = bodyAfter('private func connect()');
  assert.match(submit, /let submittedAddress = address\.trimmingCharacters\(in: \.whitespacesAndNewlines\)/);
  assert.ok(submit.indexOf('let submittedAddress') < submit.indexOf('Task {'));
  assert.match(submit, /if await model\.hub\.signIn\(baseURL: submittedAddress,[\s\S]*?\{\s*model\.hubBaseURL = submittedAddress\s+model\.saveHubURL\(\)\s+done\(\)/);
  assert.doesNotMatch(submit, /signIn\(baseURL: model\.hubBaseURL/);
});

test('native connection settings and cancellation are locked during sign-in', () => {
  const settings = bodyAfter('private var addressSettings: some View');
  assert.match(settings, /\.disabled\(isSubmitting \|\| model\.hub\.isConnecting\)/);
  assert.match(source, /Button\("취소", action: done\)[\s\S]*?\.disabled\(isSubmitting \|\| model\.hub\.isConnecting\)/);
  assert.match(bodyAfter('private var canSubmit: Bool'), /!address\.trimmingCharacters\(in: \.whitespacesAndNewlines\)\.isEmpty/);
  assert.match(bodyAfter('private func connect()'), /guard canSubmit else \{ return \}/);
});
