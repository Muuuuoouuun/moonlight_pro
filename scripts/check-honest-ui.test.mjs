import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");
const hubComponentsRoot = join(repoRoot, "apps/hub/components/hub");

const ownedFiles = {
  content: "apps/hub/components/hub/pages/content.jsx",
  dailyBrief: "apps/hub/components/hub/pages/daily-brief.jsx",
  followups: "apps/hub/components/hub/pages/followups.jsx",
  projects: "apps/hub/components/hub/pages/projects.jsx",
  quickCapture: "apps/hub/components/hub/quick-capture.jsx",
  work: "apps/hub/components/hub/pages/work.jsx",
  sidebar: "apps/hub/components/hub/hub-sidebar.jsx",
};

function readRepoFile(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".js", ".jsx", ".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

test("Hub uses Junhyuk Mun and contains no Hyeon founder demo identity", () => {
  const offenders = sourceFiles(hubComponentsRoot)
    .map((path) => ({ path, source: readFileSync(path, "utf8") }))
    .filter(({ source }) => /Hyeon(?: Park)?|role:\s*["']Founder["']/.test(source))
    .map(({ path }) => relative(repoRoot, path));

  assert.deepEqual(offenders, [], `demo identity remains in: ${offenders.join(", ")}`);
  assert.match(readRepoFile(ownedFiles.dailyBrief), /Junhyuk Mun/);
  assert.match(readRepoFile(ownedFiles.sidebar), /Junhyuk Mun/);
});

test("Daily Brief never initializes or substitutes business fixtures", () => {
  const source = readRepoFile(ownedFiles.dailyBrief);

  assert.doesNotMatch(source, /\b(?:BRIEF_SIGNALS|TODAY_BLOCKS|METRICS)\b/);
  assert.match(source, /metrics:\s*\[\]/);
  assert.match(source, /signals:\s*\[\]/);
  assert.match(source, /blocks:\s*\[\]/);
  assert.match(source, /syncState:\s*["']error["']/);
  assert.doesNotMatch(source, /4\/5 rituals done|Progress value=\{80\}/);
  assert.doesNotMatch(source, /\[\s*["']월["']\s*,\s*["']화["']\s*,\s*["']수["']/);
  assert.match(source, /브리핑 원장 확인 중/);
  assert.match(source, /다시 시도/);
  assert.doesNotMatch(source, /setState\(\(prev\)\s*=>\s*\(\{\s*\.\.\.prev,\s*syncState:\s*["']syncing["']/);
  assert.doesNotMatch(source, /setState\(["'](?:mock|empty)["']\)/);
  assert.match(source, /setOrders\(\[\]\)/);
  assert.match(source, /setStats\(null\)/);
  assert.match(source, /setData\(null\)/);
});

test("Daily Brief decisions do not claim local completion and clickable rows support keyboards", () => {
  const source = readRepoFile(ownedFiles.dailyBrief);

  assert.doesNotMatch(source, /\bsetDecided\b|Decision ·/);
  assert.match(source, /role=["']button["'][^>]*tabIndex=\{0\}[^>]*onKeyDown/s);
  assert.match(source, /if \(e\.key === ["']Enter["'] \|\| e\.key === ["'] ["']\)/);
});

test("Daily Brief mounts an honest accessible quick capture in the first fold", () => {
  const dailySource = readRepoFile(ownedFiles.dailyBrief);
  const captureSource = readRepoFile(ownedFiles.quickCapture);
  const capturePosition = dailySource.indexOf("<QuickCapture");
  const statusPosition = dailySource.indexOf("<StatusLine");

  assert.ok(capturePosition >= 0, "Daily Brief must render QuickCapture");
  assert.ok(statusPosition > capturePosition, "QuickCapture must precede the brief stack");
  assert.match(captureSource, /<label[^>]*htmlFor=["']quick-capture-text["']/);
  assert.match(captureSource, /id=["']quick-capture-text["']/);
  assert.match(captureSource, /aria-keyshortcuts=["']N["']/);
  assert.match(captureSource, /aria-live=["']polite["']/);
  assert.match(captureSource, /role=["']alert["']/);
  assert.match(captureSource, /destination[^\n]+["']task["']/);
  assert.match(captureSource, /destination[^\n]+["']inbox["']/);
  assert.match(captureSource, /role=["']group["'][^>]*aria-label=["']저장 위치["']/);
  assert.match(captureSource, /fontSize:\s*16/);
  assert.match(captureSource, /minHeight:\s*44/);
  assert.match(captureSource, /key\.toLowerCase\(\)\s*===\s*["']n["']/);
  assert.match(captureSource, /target\.closest\?\.\(["']\[role=[\\"']dialog[\\"']\]["']\)/);
  assert.match(captureSource, /onSubmit=\{submitCapture\}/);
  assert.match(captureSource, /const busy = pending \|\| unlockPending/);
  assert.ok((captureSource.match(/disabled=\{busy\}/g) || []).length >= 3);
  assert.match(captureSource, /disabled=\{busy \|\| !text\.trim\(\)\}/);
  assert.match(captureSource, /maxLength=\{4000\}/);
  assert.match(captureSource, /aria-busy=\{busy\}/);
  assert.match(captureSource, /aria-busy=\{unlockPending\}/);
  assert.match(captureSource, /submitPromiseRef\s*=\s*React\.useRef\(null\)/);
  assert.match(captureSource, /if \(submitPromiseRef\.current\) return submitPromiseRef\.current/);
  assert.match(captureSource, /submitPromiseRef\.current\s*=\s*operation/);
  assert.match(captureSource, /focusCaptureWhenReadyRef/);
  assert.match(captureSource, /if \(!busy && focusCaptureWhenReadyRef\.current\)/);
  assert.match(captureSource, /requiresUnlock/);
  assert.match(captureSource, /type=["']password["']/);
  assert.match(captureSource, /onSecretConsumed:\s*\(\)\s*=>\s*setSecret\(["']["']\)/);
  assert.match(captureSource, /result\.status\s*===\s*["']saved["']/);
  assert.match(captureSource, /result\.status\s*===\s*["']duplicate["']/);
  assert.match(captureSource, /onSaved\?\.\(result\)/);
  assert.equal((captureSource.match(/onSaved\?\.\(/g) || []).length, 1);
  assert.doesNotMatch(captureSource, /status\s*===\s*["']preview["']/);
});

test("Projects never substitutes fallback business rows", () => {
  const source = readRepoFile(ownedFiles.projects);

  assert.doesNotMatch(source, /\bFALLBACK_(?:BRANDS|PROJECTS|TODOS|COLUMNS)\b/);
  assert.match(source, /projects:\s*\[\]/);
  assert.match(source, /setTodos\(\[\]\)/);
  assert.match(source, /setSyncState\(["']error["']\)/);
  assert.match(source, /setSyncState\(["']preview["']\)/);
  assert.doesNotMatch(
    source,
    /local-(?:project|todo|card)|\b(?:createProject|createTodo|createBoardCard|moveCard|toggleTodo)\b|\bdraggable\b|\bonDrop\b/,
  );
  assert.match(source, /읽기 전용/);
  assert.match(source, /다시 시도/);
  assert.match(source, /response\.ok\s*&&\s*data\??\.status\s*===\s*["']saved["']/);
  assert.doesNotMatch(source, /data\??\.status\s*===\s*["']preview["']/);
  assert.match(source, /orderPendingId/);
  assert.match(source, /orderResults/);
  assert.doesNotMatch(source, /const \[orderPending,|const \[orderResult,/);
  assert.match(source, /disabled=\{Boolean\(orderPendingId\)\}/);
  assert.match(source, /role=["']button["'][^>]*tabIndex=\{0\}[^>]*onKeyDown/s);
});

test("Disconnected Calendar shows a connection CTA without local fake events", () => {
  const source = readRepoFile(ownedFiles.work);

  assert.doesNotMatch(source, /\bFALLBACK_CALENDAR_EVENTS\b/);
  assert.doesNotMatch(source, /\b(?:localEvents|setLocalEvents)\b/);
  assert.match(source, /Google Calendar 연결 필요/);
  assert.match(source, /Connect Google Calendar|Google Calendar 연결/);
  assert.match(source, /gridEvents\s*=\s*isLive\s*\?[^:]+:\s*\[\]/s);
  assert.match(source, /calendarData\.status\s*!==\s*["']live["']/);
  assert.match(source, /setGcalStatus\(["']error["']\)/);
  assert.match(source, /role=["']alert["']/);

  const liveGuard = source.indexOf("calendarData.status !== 'live'");
  const focusConsumed = source.indexOf("focusAppliedRef.current = true");
  assert.ok(liveGuard >= 0 && liveGuard < focusConsumed, "focus query must wait for a live calendar");
  assert.match(source, /oauthPopupRef/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /window\.addEventListener\(["']focus["']/);
  assert.match(source, /\.closed/);

  const savedCheck = source.indexOf("if (saved) router.replace(pathname)");
  assert.ok(savedCheck > focusConsumed, "focus query must only be consumed after the event is saved");
});

test("Work surfaces use empty/setup/error states instead of fixed business fixtures", () => {
  const source = readRepoFile(ownedFiles.work);

  assert.doesNotMatch(source, /FALLBACK_(?:DECISIONS|RITUALS)/);
  assert.doesNotMatch(source, /Moonlight Web v2 launch|Pricing experiment Q2|Council Q3 draft/);
  assert.match(source, /Roadmap 원장 연결 필요/);
  assert.match(source, /syncState:\s*["']error["']/);
  assert.match(source, /syncState:\s*["']preview["']/);
  assert.match(source, /refetch/);
});

test("Follow-up outcomes only look logged after a durable save", () => {
  const source = readRepoFile(ownedFiles.followups);
  const outcomeStart = source.indexOf("const logOutcome");
  const outcomeEnd = source.indexOf("\n  const { syncState", outcomeStart);
  const outcomeSource = source.slice(outcomeStart, outcomeEnd);
  const durableCheck = outcomeSource.search(/response\.ok\s*&&\s*data\??\.status\s*===\s*["']saved["']/);
  const loggedMutation = outcomeSource.indexOf("setLogged");

  assert.ok(outcomeStart >= 0 && outcomeEnd > outcomeStart, "logOutcome must exist");
  assert.ok(durableCheck >= 0 && durableCheck < loggedMutation, "durable outcome check must precede setLogged");
  assert.match(source, /setLogErrors/);
  assert.match(source, /role=["']alert["']/);
  assert.match(source, /loadRequestRef/);
  assert.match(source, /items:\s*\[\]/);
  assert.match(source, /error:/);
  assert.match(source, /다시 시도/);
});

test("Content ledgers never substitute queue or campaign fixtures", () => {
  const source = readRepoFile(ownedFiles.content);

  assert.doesNotMatch(source, /FALLBACK_(?:CONTENT_QUEUE|CAMPAIGNS)/);
  assert.match(source, /syncState:\s*["']loading["']/);
  assert.match(source, /syncState:\s*["']live-empty["']/);
  assert.match(source, /syncState:\s*["']preview["']/);
  assert.match(source, /syncState:\s*["']error["']/);
  assert.match(source, /campaigns:\s*\[\]/);
  assert.match(source, /queue:\s*\[\]/);
  assert.match(source, /\[campaigns, setCampaigns\]\s*=\s*React\.useState\(\[\]\)/);
  assert.match(source, /\[selectedId, setSelectedId\]\s*=\s*React\.useState\(null\)/);
  assert.match(source, /refetch/);
  assert.match(source, /캠페인 원장 확인 중/);
  assert.match(source, /다시 시도/);
});

test("Campaign creation only adds rows returned by a durable save", () => {
  const source = readRepoFile(ownedFiles.content);
  const createStart = source.indexOf("async function createCampaign");
  const createEnd = source.indexOf("\n  }", createStart);
  const createSource = source.slice(createStart, createEnd + 4);

  assert.ok(createStart >= 0, "createCampaign must exist");
  assert.doesNotMatch(createSource, /local-campaign-/);
  assert.match(createSource, /response\.ok\s*&&\s*data\??\.status\s*===\s*["']saved["']/);
  assert.match(source, /campaignError/);
  assert.match(source, /role=["']alert["']/);
});
