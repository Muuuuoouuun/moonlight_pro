// Provider usage summed across one Office request's model calls; null when any call lacks counts.
export function usageFor(results: { usageMetadata?: unknown }[]) {
  const counts = results.map(result => result.usageMetadata as Record<string, unknown> | null | undefined);
  const fields = ['promptTokenCount', 'candidatesTokenCount', 'totalTokenCount'] as const;
  if (counts.some(count => !count || fields.some(key => !Number.isSafeInteger(count[key]) || Number(count[key]) < 0))) return null;
  const sum = (key: typeof fields[number]) => counts.reduce((total, count) => total + Number(count![key]), 0);
  return { promptTokens: sum('promptTokenCount'), outputTokens: sum('candidatesTokenCount'), totalTokens: sum('totalTokenCount') };
}
