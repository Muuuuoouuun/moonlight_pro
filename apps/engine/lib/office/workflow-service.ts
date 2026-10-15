import type { OfficeWorkflowRequest, OfficeWorkflowContext, OfficeWorkflowResult } from '@com-moon/agent-contracts/office-workflow';
import { generateGeminiText } from '../gemini.ts';
import { runOfficeWorkflow } from './workflow-core.ts';

// Weekly writing and review each have a provider limit of 45s and share a 95s HTTP deadline.
// Other intents and Council retain 48s. Hub owns durable claim and finish; no retry is added.
export async function generateOfficeWorkflow(request: OfficeWorkflowRequest, context: OfficeWorkflowContext, generate: typeof generateGeminiText = input => generateGeminiText({ ...input, usageSurface: input.usageSurface || 'office-workflow' })): Promise<OfficeWorkflowResult> {
  const timeout = request.intent === 'weekly_report' && request.mode !== 'council' ? 95_000 : 48_000;
  return runOfficeWorkflow(request, context, { signal: AbortSignal.timeout(timeout), generate });
}
