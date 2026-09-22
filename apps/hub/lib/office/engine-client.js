const ENGINE_PATH = '/api/ai/office-chat';

function resolveEngineUrl() {
  return (process.env.COM_MOON_ENGINE_URL?.trim() || '').replace(/\/$/, '');
}

function resolveSharedSecret() {
  return process.env.COM_MOON_SHARED_WEBHOOK_SECRET?.trim() || '';
}

export async function callEngineOfficeChat(body) {
  const engineUrl = resolveEngineUrl();

  if (!engineUrl) {
    return {
      status: 202,
      data: {
        status: 'preview',
        error: 'COM_MOON_ENGINE_URL is not configured.',
      },
    };
  }

  const headers = { 'content-type': 'application/json' };
  const sharedSecret = resolveSharedSecret();
  if (sharedSecret) {
    headers['x-com-moon-shared-secret'] = sharedSecret;
  }

  let response;
  try {
    response = await fetch(`${engineUrl}${ENGINE_PATH}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(45_000),
      redirect: 'error',
    });
  } catch {
    return {
      status: 502,
      data: { status: 'error', reason: 'engine-request-failed' },
    };
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }
  return { status: response.status, data };
}
