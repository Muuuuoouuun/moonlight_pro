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
  error?: string;
  reason?: string;
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
  };
}
