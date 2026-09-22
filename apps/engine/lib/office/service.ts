import type { SanitizedOfficeChatInput, OfficeAgentId, OfficeMode } from '@com-moon/agent-contracts/office';
import { OFFICE_AGENTS } from '@com-moon/agent-contracts/office';
import { generateGeminiText, getGeminiIntegrationStatus, type GeminiUsageMetadata } from '../gemini.ts';
import { buildOfficePrompt } from './prompt.ts';

export interface OfficeChatServiceResult {
  status: 'generated' | 'preview' | 'error';
  text: string;
  agentId: OfficeAgentId;
  mode: OfficeMode;
  participants: OfficeAgentId[];
  model?: string;
  appliedModel?: string;
  fallbackFrom?: string;
  isSimulation?: boolean;
  evaluation?: {
    score: number | null;
    gate: string | null;
    summary: string | null;
  } | null;
  usageMetadata?: GeminiUsageMetadata | null;
  latencyMs?: number;
  error?: string;
  reason?: string;
}

export function resolveOfficeModelConfig(input: SanitizedOfficeChatInput) {
  const status = getGeminiIntegrationStatus();
  const persona = OFFICE_AGENTS[input.agentId] || OFFICE_AGENTS.eevee;

  // 1. Tier determination
  const isProDemand =
    input.evaluate ||
    input.mode === 'council' ||
    input.mode === 'critique' ||
    persona.recommendedTier === 'pro' ||
    (input.agentId === 'jolteon' && input.mode === 'task') ||
    (input.agentId === 'leafeon' && input.mode === 'task');

  const defaultPrimary = isProDemand ? status.proModel : status.flashModel;
  const defaultFallback = isProDemand ? status.flashModel : status.proModel;

  const primaryModel = input.model?.trim() || defaultPrimary;
  const fallbackModel = primaryModel !== defaultFallback ? defaultFallback : null;

  // 2. Temperature determination
  let temperature = persona.defaultTemperature ?? 0.3;
  if (input.evaluate) {
    // Clamp to 0.15 when evaluating for rigorous consistency
    temperature = Math.min(temperature, 0.15);
  } else if (input.mode === 'critique') {
    temperature = Math.min(temperature, 0.18);
  } else if (input.mode === 'council') {
    temperature = 0.35; // balanced for multi-perspective debate
  } else if (input.agentId === 'jolteon' && input.mode === 'task') {
    temperature = 0.15; // deterministic code diffs
  } else if (input.agentId === 'leafeon' && input.mode === 'task') {
    temperature = 0.15; // precise financial computation
  }

  // 3. TopP determination
  let topP = 0.85;
  if (input.agentId === 'umbreon' || input.evaluate || input.mode === 'critique') {
    topP = 0.8;
  } else if (input.agentId === 'sylveon') {
    topP = 0.95;
  } else if (input.agentId === 'flareon') {
    topP = 0.9;
  }

  // 4. Max Output Tokens
  let maxOutputTokens = 3072;
  if (input.mode === 'council') {
    maxOutputTokens = 8192;
  } else if (input.mode === 'task' || input.mode === 'critique' || input.evaluate) {
    maxOutputTokens = 4096;
  }

  return {
    primaryModel,
    fallbackModel,
    temperature,
    topP,
    maxOutputTokens,
    isProDemand,
  };
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
  const modelConfig = resolveOfficeModelConfig(input);

  if (!integration.configured) {
    return {
      status: 'preview',
      text: '',
      agentId: input.agentId,
      mode: input.mode,
      participants: input.participants,
      model: modelConfig.primaryModel,
      appliedModel: modelConfig.primaryModel,
      isSimulation: input.mode === 'council',
      evaluation: null,
      error: 'GEMINI_API_KEY is not configured on Engine.',
    };
  }

  const { systemInstruction, prompt } = buildOfficePrompt(input);

  const response = await generateGeminiText({
    prompt,
    systemInstruction,
    model: modelConfig.primaryModel,
    fallbackModel: modelConfig.fallbackModel || undefined,
    temperature: modelConfig.temperature,
    topP: modelConfig.topP,
    maxOutputTokens: modelConfig.maxOutputTokens,
  });

  if (!response.ok || !response.text) {
    return {
      status: 'error',
      text: '',
      agentId: input.agentId,
      mode: input.mode,
      participants: input.participants,
      model: response.model || modelConfig.primaryModel,
      appliedModel: response.model || modelConfig.primaryModel,
      fallbackFrom: response.fallbackFrom,
      isSimulation: input.mode === 'council',
      evaluation: null,
      error: response.reason || 'Failed to generate office response.',
      reason: response.reason,
      latencyMs: response.latencyMs,
    };
  }

  return {
    status: 'generated',
    text: response.text,
    agentId: input.agentId,
    mode: input.mode,
    participants: input.participants,
    model: response.model || modelConfig.primaryModel,
    appliedModel: response.model || modelConfig.primaryModel,
    fallbackFrom: response.fallbackFrom,
    isSimulation: input.mode === 'council',
    evaluation: extractEvaluation(response.text),
    usageMetadata: response.usageMetadata || null,
    latencyMs: response.latencyMs,
  };
}
