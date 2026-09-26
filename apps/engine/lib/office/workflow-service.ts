import type { OfficeWorkflowRequest, OfficeWorkflowContext, OfficeWorkflowResult } from '@com-moon/agent-contracts/office-workflow';
import { generateGeminiText } from '../gemini.ts';
import { runOfficeWorkflow } from './workflow-core.ts';

// Hub owns durable claim and finish. The HTTP path retains its shared 48-second deadline.
export async function generateOfficeWorkflow(request: OfficeWorkflowRequest, context: OfficeWorkflowContext, generate: typeof generateGeminiText = input => generateGeminiText({ ...input, usageSurface: input.usageSurface || 'office-workflow' })): Promise<OfficeWorkflowResult> {
  return runOfficeWorkflow(request, context, { signal: AbortSignal.timeout(48_000), generate });
}
