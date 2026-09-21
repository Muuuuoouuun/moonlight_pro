import { validateSharedWebhookRequest } from '../../../../lib/shared-webhook.ts';
import { createOfficeEngineHandler } from '../../../../lib/office/http.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const POST=createOfficeEngineHandler(validateSharedWebhookRequest);
