import { NextResponse } from 'next/server.js';

import { assertHubWriteAllowed, readHubWriteJson } from '@/lib/hub-write-guard';
import { recordAgentRun } from '@/lib/sales-os/agent-runs';
import { advisorRunResult } from '@/lib/sales-os/advisor-result';
import { parseOfficeChatInput, OfficeContractError } from '@com-moon/agent-contracts/office';
import { assembleOfficeContext } from '@/lib/office/context';
import { callEngineOfficeChat } from '@/lib/office/engine-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const guard = assertHubWriteAllowed(req);
  if (guard) {
    return guard;
  }

  const parsed = await readHubWriteJson(req);
  if (parsed.error) {
    return parsed.error;
  }

  let sanitized;
  try {
    sanitized = parseOfficeChatInput(parsed.data || {});
  } catch (err) {
    const code = err instanceof OfficeContractError ? err.code : 'invalid-input';
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: 'error', code, error: message },
      { status: 400 }
    );
  }

  const { agentId, mode, message, draft, participants, lens, context: customContext, evaluate } = sanitized;

  const context = customContext || (await assembleOfficeContext({ agentId, mode }));
  const result = await callEngineOfficeChat({
    agentId,
    mode,
    message,
    draft,
    participants,
    lens,
    context,
    evaluate,
  });

  // Best-effort episodic memory logging
  let run = { persisted: false, id: null };
  try {
    const agentKey = mode === 'council' ? 'office.council' : `office.${agentId}`;
    run = await recordAgentRun({
      agent: agentKey,
      mode,
      ref: lens ? `lens=${lens}` : null,
      inputSummary: `mode=${mode} agent=${agentId} eval=${evaluate} msg=${(message || '').slice(0, 50)}`,
      recommendation:
        result.data && typeof result.data === 'object'
          ? {
              text: (result.data.text || '').slice(0, 2000),
              evaluation: result.data.evaluation || null,
            }
          : null,
      result: advisorRunResult(result.status, result.data),
    });
  } catch {
    // Logging is best-effort
  }

  const data =
    result.data && typeof result.data === 'object'
      ? { ...result.data, runId: run?.id || null }
      : result.data;

  return NextResponse.json(data, { status: result.status });
}
