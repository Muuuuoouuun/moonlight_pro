// Run with Node 24+: node --env-file=<local-env> scripts/check-vertex-connection.mjs
// Emits no credentials, source documents, prompts, or provider error messages.
import { generateGeminiText, getGeminiIntegrationStatus } from '../apps/engine/lib/gemini.ts';

const provider = getGeminiIntegrationStatus();
if (provider.backend !== 'vertex' || !provider.configured) {
  console.error(JSON.stringify({ ok: false, reason: 'vertex-not-configured' }));
  process.exitCode = 1;
} else {
  const result = await generateGeminiText({
    prompt: "한국어로 '연결 성공'이라고만 답해 주세요.",
    maxOutputTokens: 1024,
    thinkingLevel: 'low',
    usageSurface: 'vertex-connection-check',
  });
  const ok = result.ok && result.text.includes('연결 성공');
  console.log(JSON.stringify({ ok, backend: provider.backend, projectId: provider.projectId,
    location: provider.location, model: result.model, modelVersion: result.modelVersion,
    httpStatus: result.status, failureCategory: result.failureCategory, usageMetadata: result.usageMetadata }));
  if (!ok) process.exitCode = 1;
}
