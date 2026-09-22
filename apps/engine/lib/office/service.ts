import type { OfficeRequest, OfficeContext } from '@com-moon/agent-contracts/office';
import { generateGeminiText } from '../gemini.ts';
import type { OfficeDiagnosticCallback } from './deliberation.ts';
import { runOfficeResponse } from './response-core.ts';

export async function generateOfficeResponse(request: OfficeRequest, context: OfficeContext, generate = generateGeminiText, onDiagnostic?: OfficeDiagnosticCallback) {
  // Every phase shares one deadline, inside Hub's 55s and Engine route's 60s budgets.
  return runOfficeResponse(request, context, { signal: AbortSignal.timeout(48_000), generate, onDiagnostic });
}
