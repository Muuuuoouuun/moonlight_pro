import { qualityHash } from './runner.mjs';
import { OFFICE_IDS } from '@com-moon/agent-contracts/office';
import { classifyGeminiFailure, getGeminiResponseDiagnostics } from '../../apps/engine/lib/gemini.ts';

const PHASES = new Set(['draft', 'review', 'position', 'response', 'synthesis']);
const CATEGORIES = new Set(['provider', 'json', 'source-review', 'contract', 'deadline', 'model-mismatch']);

// Evaluation-only instrumentation around the real provider helper. No prompt changes,
// retries, score guesses, network inspection, credentials, or production logging.
export function createTracedOfficeGenerator(generateOffice, generateProvider, configuredModel) {
  return async (request, context) => {
    const calls = [];
    const diagnostics = [];
    const observeDiagnostic = event => {
      if (!event || !PHASES.has(event.phase) || !CATEGORIES.has(event.category)) return;
      diagnostics.push({ phase: event.phase, category: event.category, ...(OFFICE_IDS.includes(event.ownerId) ? { ownerId: event.ownerId } : {}) });
    };
    const observedProvider = async input => {
      const id = calls.length + 1;
      const trace = {
        id, startedAt: new Date().toISOString(),
        promptHash: qualityHash(input.prompt), systemInstructionHash: qualityHash(input.systemInstruction || ''),
        settings: {
          modelRequested: input.model || configuredModel || null,
          maxOutputTokens: input.maxOutputTokens || null, thinkingLevel: input.thinkingLevel || null,
          responseSchemaHash: input.responseJsonSchema ? qualityHash(input.responseJsonSchema) : null,
        },
      };
      calls.push(trace);
      const started = Date.now();
      try {
        const result = await generateProvider(input);
        const failureCategory = result.ok === true ? null : classifyGeminiFailure(result);
        const httpStatus = Number.isInteger(result.status) ? result.status : null;
        // Preserve established machine codes only, never arbitrary message/code text.
        const reason = result.ok === true ? 'ok'
          : result.reason === 'max_tokens' ? 'max_tokens'
          : httpStatus && result.reason === `http-${httpStatus}` ? `http-${httpStatus}`
          : failureCategory;
        trace.result = {
          ok: result.ok === true, model: result.model || null,
          reason, failureCategory, httpStatus,
          ...getGeminiResponseDiagnostics(result),
          outputHash: typeof result.text === 'string' ? qualityHash(result.text) : null,
        };
        return result;
      } catch (error) {
        const failureCategory = classifyGeminiFailure(error, input.signal);
        trace.result = { ok: false, reason: failureCategory, failureCategory, model: null, httpStatus: null, ...getGeminiResponseDiagnostics(null) };
        throw error;
      } finally { trace.elapsedMs = Date.now() - started; }
    };
    let response;
    let exceptionCategory;
    try { response = await generateOffice(request, context, observedProvider, observeDiagnostic); }
    catch (error) { response = { status: 'error' }; exceptionCategory = classifyGeminiFailure(error); }
    const codes = [...new Set(calls.filter(call => call.result?.ok === false).map(call => call.result.reason || 'provider_failed'))];
    const lastDiagnostic = diagnostics.at(-1);
    const diagnosticCode = lastDiagnostic ? `${lastDiagnostic.phase}_${lastDiagnostic.category}` : null;
    // A failed parse/review can cancel sibling calls. Keep those cancellations in
    // failureCodes, but do not let them or a later deadline hide the causal stage.
    // Actual provider timeouts/errors retain priority over stage diagnostics.
    const causalDiagnostic = diagnostics.find(event => event.category !== 'provider' && event.category !== 'deadline');
    const providerCode = codes.find(code => code !== 'aborted');
    const cancellationCause = !providerCode && codes.includes('aborted') && causalDiagnostic ? `${causalDiagnostic.phase}_${causalDiagnostic.category}` : null;
    return {
      ...response,
      ...(response?.status !== 'generated' && !response?.errorCode ? { errorCode: providerCode || cancellationCause || codes[0] || diagnosticCode || (exceptionCategory ? exceptionCategory === 'provider-error' ? 'generation_exception' : exceptionCategory : 'generation_or_review_failed') } : {}),
      evaluationTrace: { calls, failureCodes: codes, diagnostics },
    };
  };
}
