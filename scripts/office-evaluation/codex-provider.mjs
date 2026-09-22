import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

export const CODEX_CLI_PROVIDER_VERSION = 'office-codex-cli-eval-v1';
export const CODEX_CLI_DEFAULT_MODEL = 'codex-cli-default';
const execFileAsync = promisify(execFile);
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
const TERMINATE_GRACE_MS = 250;
const REQUIRED_FLAGS = ['--ignore-user-config', '--ephemeral', '--sandbox', '--skip-git-repo-check', '--cd', '--config', '--output-schema', '--json'];
const CONFIG = ['web_search="disabled"', 'approval_policy="never"', 'project_doc_max_bytes=0', 'features.shell_tool=false', 'features.unified_exec=false', 'features.apps=false', 'features.multi_agent=false', 'features.hooks=false', 'features.memories=false'];
const ITEM_TYPES = new Set(['agent_message', 'reasoning']);
const TOOL_TYPES = new Set(['command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'collab_tool_call', 'tool_call', 'function_call']);
const EVENT_TYPES = new Set(['thread.started', 'turn.started', 'turn.completed', 'turn.failed', 'item.started', 'item.updated', 'item.completed', 'error']);
const hash = value => createHash('sha256').update(value).digest('hex');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0;

// Keep the operator's normal CLI login location. Never read, copy or replace auth
// files, or pass API keys/other application secrets through the child environment.
function cliEnvironment() {
  const keys = ['PATH', 'HOME', 'CODEX_HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY'];
  return Object.fromEntries(keys.filter(key => typeof process.env[key] === 'string').map(key => [key, process.env[key]]));
}

function usageFrom(raw) {
  if (!record(raw)) return { raw: null, mapped: null };
  const usage = Object.fromEntries(['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens'].filter(key => count(raw[key])).map(key => [key, raw[key]]));
  return {
    raw: Object.keys(usage).length ? usage : null,
    mapped: count(usage.input_tokens) && count(usage.output_tokens) && count(usage.input_tokens + usage.output_tokens)
      ? { promptTokenCount: usage.input_tokens, candidatesTokenCount: usage.output_tokens, totalTokenCount: usage.input_tokens + usage.output_tokens, ...(count(usage.cached_input_tokens) ? { cachedContentTokenCount: usage.cached_input_tokens } : {}) }
      : null,
  };
}

// No model selection, API transport or product defaults are changed. The second
// argument is a process seam for offline boundary tests, not a provider retry path.
export async function createCodexCliProvider({ command = 'codex', argv = [], timeoutMs = 45_000 } = {}, { spawnImpl = spawn, execFileImpl = execFileAsync, killImpl = process.kill.bind(process) } = {}) {
  if (process.platform === 'win32' || typeof command !== 'string' || !command || command.includes('\0') || !Array.isArray(argv) || argv.some(arg => typeof arg !== 'string' || arg.includes('\0')) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 45_000) throw new Error('invalid-codex-provider-options');
  const env = cliEnvironment();
  let cliVersion;
  try {
    const options = { encoding: 'utf8', timeout: 3_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024, env };
    const version = await execFileImpl(command, [...argv, '--version'], options);
    cliVersion = /^codex-cli (\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?)\s*$/.exec(version.stdout)?.[1];
    const help = await execFileImpl(command, [...argv, 'exec', '--help'], options);
    if (!cliVersion || REQUIRED_FLAGS.some(flag => !help.stdout.includes(flag))) throw new Error('unsupported-codex-cli');
  } catch { throw new Error('codex-cli-preflight-failed'); }
  const provenance = Object.freeze({
    adapterVersion: CODEX_CLI_PROVIDER_VERSION, transport: 'saved-login-codex-cli', cliVersion,
    commandName: basename(command), commandPrefixHash: hash(JSON.stringify(argv)), platform: process.platform, arch: process.arch, nodeVersion: process.version,
    modelRequested: 'CLI default (user config not loaded)', modelVersion: null,
    instructionTransport: 'developer_instructions', userPromptTransport: 'stdin-verbatim', outputSchemaTransport: 'unmodified-json-file',
    requiredFlags: [...REQUIRED_FLAGS], config: [...CONFIG], emptyWorkingDirectory: true, detachedProcessGroup: true,
    timeoutMs, terminateGraceMs: TERMINATE_GRACE_MS, adapterRetries: 0, cliInternalRetries: 'uncontrolled-built-in-provider',
    outputTokenCapApplied: null, thinkingLevelMapping: 'model_reasoning_effort', builtInCliInstructionsRetained: true,
    configReference: 'https://learn.chatgpt.com/docs/config-file/config-reference', protocolReference: 'https://learn.chatgpt.com/docs/non-interactive-mode',
  });

  async function generate(input) {
    const started = performance.now();
    const metadata = { provenance, elapsedMs: 0, exitCode: null, exitSignal: null, turnCompleted: false, finalJsonParsed: false, toolEventsObserved: 0, events: [], usage: null,
      requestedMaxOutputTokens: count(input?.maxOutputTokens) ? input.maxOutputTokens : null, reasoningEffortApplied: ['low', 'high'].includes(input?.thinkingLevel) ? input.thinkingLevel : null };
    const result = (reason, text = '', usageMetadata = null, modelVersion = null) => {
      metadata.elapsedMs = Math.round(performance.now() - started);
      return { ok: reason === null, status: null, reason: reason || 'ok', failureCategory: reason === null ? null : ['timeout', 'aborted', 'invalid-json', 'invalid-request', 'empty-output', 'incomplete-output'].includes(reason) ? reason : 'provider-error',
        text: reason === null ? text : '', model: CODEX_CLI_DEFAULT_MODEL, modelVersion, finishReason: null, usageMetadata, promptFeedback: null, adapterMetadata: metadata };
    };
    if (!record(input) || typeof input.prompt !== 'string' || input.systemInstruction !== undefined && typeof input.systemInstruction !== 'string' || !record(input.responseJsonSchema)
      || input.model !== undefined && input.model !== CODEX_CLI_DEFAULT_MODEL || input.media?.length || input.thinkingLevel !== undefined && !['low', 'high'].includes(input.thinkingLevel)
      || input.maxOutputTokens !== undefined && (!count(input.maxOutputTokens) || input.maxOutputTokens === 0)) return result('invalid-request');
    if (input.signal?.aborted) return result(input.signal.reason?.name === 'TimeoutError' ? 'timeout' : 'aborted');
    let directory;
    try {
      const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
      directory = await mkdtemp(join(tmpdir(), 'moonlight-office-codex-'));
      const workingDirectory = join(directory, 'workspace');
      await mkdir(workingDirectory, { mode: 0o700 });
      const schemaText = JSON.stringify(input.responseJsonSchema);
      const schemaPath = join(directory, 'response.schema.json');
      await writeFile(schemaPath, schemaText, { mode: 0o600 });
      metadata.promptHash = hash(input.prompt);
      metadata.systemInstructionHash = hash(input.systemInstruction || '');
      metadata.responseSchemaHash = hash(schemaText);
      const args = [...argv, 'exec', '--ignore-user-config', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '--cd', workingDirectory,
        ...CONFIG.flatMap(setting => ['--config', setting]), '--config', `developer_instructions=${JSON.stringify(input.systemInstruction || '')}`,
        ...(input.thinkingLevel ? ['--config', `model_reasoning_effort=${JSON.stringify(input.thinkingLevel)}`] : []), '--output-schema', schemaPath, '--json', '-'];
      if (signal.aborted) return result(input.signal?.aborted && input.signal.reason?.name !== 'TimeoutError' ? 'aborted' : 'timeout');
      let failure = null, finalText = '', modelVersion = null, completed = false, usage = { raw: null, mapped: null }, capturedBytes = 0, pending = '';
      let child, closeSeen = false, killTimer;
      const decoder = new StringDecoder('utf8');
      const killGroup = signalName => { if (child?.pid) { try { killImpl(-child.pid, signalName); } catch { /* Process group may already have exited. */ } } };
      const stop = reason => {
        failure ||= reason;
        if (closeSeen || killTimer) return;
        killGroup('SIGTERM');
        killTimer = setTimeout(() => killGroup('SIGKILL'), TERMINATE_GRACE_MS);
      };
      const onAbort = () => stop(input.signal?.aborted && input.signal.reason?.name !== 'TimeoutError' ? 'aborted' : 'timeout');
      const onLine = line => {
        if (failure || !line.trim()) return;
        let event;
        try { event = JSON.parse(line); } catch { stop('invalid-event-json'); return; }
        if (!record(event) || !EVENT_TYPES.has(event.type)) { stop('unsupported-event'); return; }
        const item = record(event.item) ? event.item : null;
        const summary = { type: event.type };
        if (event.type.startsWith('item.')) {
          if (!item || !ITEM_TYPES.has(item.type)) {
            if (item && TOOL_TYPES.has(item.type)) { summary.itemType = item.type; metadata.toolEventsObserved++; }
            metadata.events.push(summary); stop(item && TOOL_TYPES.has(item.type) ? 'unexpected-tool-use' : 'unsupported-item'); return;
          }
          summary.itemType = item.type;
        }
        metadata.events.push(summary);
        if (metadata.events.length > 2_000) { stop('output-limit'); return; }
        if (event.type === 'error' || event.type === 'turn.failed') { stop('cli-turn-failed'); return; }
        if (completed) { stop('events-after-completion'); return; }
        if (['thread.started', 'turn.started', 'turn.completed'].includes(event.type)) {
          const reported = event.model_version ?? event.modelVersion;
          if (typeof reported === 'string' && /^[a-zA-Z0-9._:/@-]{1,200}$/.test(reported)) modelVersion = reported;
        }
        if (event.type === 'item.completed' && item?.type === 'agent_message') {
          if (typeof item.text !== 'string') { stop('invalid-final-message'); return; }
          finalText = item.text;
        }
        if (event.type === 'turn.completed') { completed = true; metadata.turnCompleted = true; usage = usageFrom(event.usage); metadata.usage = usage.raw; }
      };
      try {
        child = spawnImpl(command, args, { cwd: workingDirectory, env, detached: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
        const exited = new Promise(resolve => {
          child.once('error', () => stop('cli-process-error'));
          child.once('close', (code, exitSignal) => { closeSeen = true; metadata.exitCode = Number.isInteger(code) ? code : null; metadata.exitSignal = ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV'].includes(exitSignal) ? exitSignal : null; resolve(); });
        });
        child.stdout.on('data', chunk => {
          capturedBytes += Buffer.byteLength(chunk);
          if (capturedBytes > MAX_CAPTURE_BYTES) { stop('output-limit'); return; }
          pending += decoder.write(chunk);
          let newline;
          while ((newline = pending.indexOf('\n')) >= 0) { const line = pending.slice(0, newline); pending = pending.slice(newline + 1); onLine(line); }
        });
        // Drain diagnostics without storing or returning raw provider errors.
        child.stderr.on('data', chunk => { capturedBytes += Buffer.byteLength(chunk); if (capturedBytes > MAX_CAPTURE_BYTES) stop('output-limit'); });
        child.stdin.on('error', () => stop('cli-stdin-error'));
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort(); else child.stdin.end(input.prompt);
        await exited; // Includes abort/kill cleanup: callers must not snapshot an unfinished trace.
        pending += decoder.end();
        if (pending) onLine(pending);
      } finally {
        signal.removeEventListener('abort', onAbort);
        clearTimeout(killTimer);
        if (failure) killGroup('SIGKILL');
      }
      if (failure) return result(failure, '', usage.mapped, modelVersion);
      if (metadata.exitCode !== 0) return result('cli-exit-nonzero', '', usage.mapped, modelVersion);
      if (!completed) return result('incomplete-output', '', usage.mapped, modelVersion);
      if (!finalText.trim()) return result('empty-output', '', usage.mapped, modelVersion);
      try { JSON.parse(finalText); metadata.finalJsonParsed = true; } catch { return result('invalid-json', '', usage.mapped, modelVersion); }
      return result(null, finalText, usage.mapped, modelVersion);
    } catch { return result(input.signal?.aborted ? input.signal.reason?.name === 'TimeoutError' ? 'timeout' : 'aborted' : 'cli-setup-failed'); }
    finally { if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {}); }
  }
  return { generate, provenance };
}
