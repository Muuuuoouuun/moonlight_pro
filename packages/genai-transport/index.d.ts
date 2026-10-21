export interface GenaiStatus {
  configured: boolean;
  backend: string;
  projectId: string | null;
  location: string | null;
  authMode: string;
  apiBaseUrl: string;
}
export function resolveGenaiApiKey(env?: NodeJS.ProcessEnv): string;
export function getGenaiStatus(env?: NodeJS.ProcessEnv): GenaiStatus;
export function prepareGenaiRequest(model: string, options?: { env?: NodeJS.ProcessEnv; signal?: AbortSignal }): Promise<{ url: string; headers: Record<string, string> }>;
