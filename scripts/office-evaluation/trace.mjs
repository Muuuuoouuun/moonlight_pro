import { qualityHash } from './runner.mjs';

// Evaluation-only instrumentation around the real provider helper. No prompt changes,
// retries, score guesses, network inspection, credentials, or production logging.
export function createTracedOfficeGenerator(generateOffice, generateProvider, configuredModel) {
  return async (request, context) => {
    const calls = [];
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
        trace.result = {
          ok: result.ok === true, model: result.model || null,
          reason: typeof result.reason === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(result.reason) ? result.reason : null,
          httpStatus: Number.isInteger(result.status) ? result.status : null,
          outputHash: typeof result.text === 'string' ? qualityHash(result.text) : null,
        };
        return result;
      } catch (error) {
        trace.result = { ok: false, reason: typeof error?.code === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(error.code) ? error.code : 'provider_exception', model: null };
        throw error;
      } finally { trace.elapsedMs = Date.now() - started; }
    };
    let response;
    try { response = await generateOffice(request, context, observedProvider); }
    catch (error) { response = { status: 'error', errorCode: typeof error?.code === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(error.code) ? error.code : 'generation_exception' }; }
    const codes = [...new Set(calls.filter(call => call.result?.ok === false).map(call => call.result.reason || 'provider_failed'))];
    return {
      ...response,
      ...(response?.status !== 'generated' && !response?.errorCode ? { errorCode: codes[0] || 'generation_or_review_failed' } : {}),
      evaluationTrace: { calls, failureCodes: codes },
    };
  };
}
