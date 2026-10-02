// A dedicated writing/review choice, separate from chat and customer workflows.
// Same-source trials reproduced scope/status errors in the older Flash setup.
// The low thinking setting leaves room for the final answer inside each 45s call.
export const DEFAULT_CONTENT_QUALITY_MODEL='gemini-3.1-pro-preview';
export function contentQualityGeneration() {
  const configured=process.env.COM_MOON_CONTENT_QUALITY_MODEL?.trim();
  const model=configured&&/^[a-zA-Z0-9._-]{1,100}$/.test(configured)?configured:DEFAULT_CONTENT_QUALITY_MODEL;
  return {model,thinkingLevel:'low' as const,thinkingBudget:2048,maxOutputTokens:16384,retries:0};
}
