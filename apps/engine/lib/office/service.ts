import type { SanitizedOfficeChatInput, OfficeAgentId, OfficeMode } from '@com-moon/agent-contracts/office';
import { generateGeminiText, getGeminiIntegrationStatus } from '../gemini.ts';
import { buildOfficePrompt } from './prompt.ts';

export interface OfficeChatServiceResult {
  status: 'generated' | 'preview' | 'error';
  text: string;
  agentId: OfficeAgentId;
  mode: OfficeMode;
  participants: OfficeAgentId[];
  model?: string;
  isSimulation?: boolean;
  evaluation?: {
    score: number | null;
    gate: string | null;
    summary: string | null;
  } | null;
  error?: string;
  reason?: string;
}

function extractEvaluation(text: string) {
  const scoreMatch = text.match(/\[SCORE\]:\s*(\d+)/i);
  const gateMatch = text.match(/\[GATE\]:\s*(PASS|REVISE|REJECT)/i);
  const summaryMatch = text.match(/\[EVAL_SUMMARY\]:\s*([^\n\r]+)/i);

  if (!scoreMatch && !gateMatch) return null;

  return {
    score: scoreMatch ? Number.parseInt(scoreMatch[1], 10) : null,
    gate: gateMatch ? gateMatch[1].toUpperCase() : null,
    summary: summaryMatch ? summaryMatch[1].trim() : null,
  };
}

export async function executeOfficeChat(
  input: SanitizedOfficeChatInput
): Promise<OfficeChatServiceResult> {
  const integration = getGeminiIntegrationStatus();

  if (!integration.configured) {
    return {
      status: 'preview',
      text: '',
      agentId: input.agentId,
      mode: input.mode,
      participants: input.participants,
      model: integration.model,
      isSimulation: input.mode === 'council',
      evaluation: null,
      error: 'GEMINI_API_KEY is not configured on Engine.',
    };
  }

  const { systemInstruction, prompt } = buildOfficePrompt(input);

  const response = await generateGeminiText({
    prompt,
    systemInstruction,
    model: integration.model,
    maxOutputTokens: 8192,
  });

  if (!response.ok || !response.text) {
    return {
      status: 'error',
      text: '',
      agentId: input.agentId,
      mode: input.mode,
      participants: input.participants,
      model: response.model || integration.model,
      isSimulation: input.mode === 'council',
      evaluation: null,
      error: response.reason || 'Failed to generate office response.',
      reason: response.reason,
    };
  }

  return {
    status: 'generated',
    text: response.text,
    agentId: input.agentId,
    mode: input.mode,
    participants: input.participants,
    model: response.model || integration.model,
    isSimulation: input.mode === 'council',
    evaluation: extractEvaluation(response.text),
  };
}
