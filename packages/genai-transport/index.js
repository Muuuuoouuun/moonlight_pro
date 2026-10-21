// Server-only provider transport shared by Hub and Engine. Selecting Vertex must
// never silently spend an AI Studio API key when Cloud authentication fails.
import { GoogleAuth, ExternalAccountClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';

const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const PROJECT = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
const LOCATION = /^(global|[a-z]+-[a-z]+[0-9])$/;
const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,62}$/;
let cachedAuth;
let cachedAuthKey;

export function resolveGenaiApiKey(env = process.env) {
  return env.GEMINI_API_KEY?.trim() || env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || '';
}

export function getGenaiStatus(env = process.env) {
  const backend = env.GEMINI_BACKEND?.trim() || 'developer';
  const projectId = env.GOOGLE_CLOUD_PROJECT?.trim() || env.GCP_PROJECT_ID?.trim() || '';
  const location = env.GOOGLE_CLOUD_LOCATION?.trim() || 'global';
  const authMode = env.VERCEL === '1' ? 'vercel-oidc' : env.GCP_AUTH_MODE?.trim() || 'adc';
  const federationReady = /^\d+$/.test(env.GCP_PROJECT_NUMBER || '')
    && IDENTIFIER.test(env.GCP_WORKLOAD_IDENTITY_POOL_ID || '')
    && IDENTIFIER.test(env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID || '')
    && /^[a-zA-Z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(env.GCP_SERVICE_ACCOUNT_EMAIL || '');
  const vertexReady = PROJECT.test(projectId) && LOCATION.test(location)
    && (authMode === 'adc' || (authMode === 'vercel-oidc' && federationReady));
  const apiBaseUrl = backend === 'vertex'
    ? `https://${location === 'global' ? '' : `${location}-`}aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google`
    : (env.GEMINI_API_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  return {
    configured: backend === 'vertex' ? vertexReady : backend === 'developer' && Boolean(resolveGenaiApiKey(env)),
    backend, projectId: backend === 'vertex' ? projectId : null,
    location: backend === 'vertex' ? location : null,
    authMode: backend === 'vertex' ? authMode : 'api-key',
    apiBaseUrl,
  };
}

function authFor(status, env) {
  // Reuse Google's expiring-token cache, while noticing configuration changes.
  const key = JSON.stringify([status.projectId, status.authMode, env.GCP_PROJECT_NUMBER,
    env.GCP_WORKLOAD_IDENTITY_POOL_ID, env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
    env.GCP_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_APPLICATION_CREDENTIALS]);
  if (cachedAuth && key === cachedAuthKey) return cachedAuth;
  let authClient;
  if (status.authMode === 'vercel-oidc') {
    authClient = ExternalAccountClient.fromJSON({
      type: 'external_account',
      audience: `//iam.googleapis.com/projects/${env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${env.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
      subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
    });
    if (!authClient) throw new Error('genai-authentication-failed');
  }
  cachedAuth = new GoogleAuth({ projectId: status.projectId, scopes: [SCOPE], ...(authClient ? { authClient } : {}) });
  cachedAuthKey = key;
  return cachedAuth;
}

async function boundedToken(promise, signal) {
  signal.throwIfAborted();
  let abort;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
    })]);
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
  }
}

export async function prepareGenaiRequest(model, { env = process.env, signal } = {}) {
  signal?.throwIfAborted();
  const status = getGenaiStatus(env);
  if (!status.configured) throw Object.assign(new Error('genai-not-configured'), { code: 'GENAI_CONFIGURATION' });
  if (!MODEL.test(model)) throw Object.assign(new Error('invalid-genai-model'), { code: 'GENAI_CONFIGURATION' });
  const headers = { 'content-type': 'application/json' };
  if (status.backend === 'vertex') {
    const authSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
    try {
      const token = await boundedToken(authFor(status, env).getAccessToken(), authSignal);
      if (!token) throw new Error('missing-token');
      headers.Authorization = `Bearer ${token}`;
      headers['x-goog-user-project'] = status.projectId;
    } catch {
      if (authSignal.aborted) throw authSignal.reason;
      throw Object.assign(new Error('Google Cloud authentication failed'), { code: 'GENAI_AUTHENTICATION' });
    }
  } else {
    headers['x-goog-api-key'] = resolveGenaiApiKey(env);
  }
  return { url: `${status.apiBaseUrl}/models/${model}:generateContent`, headers };
}
