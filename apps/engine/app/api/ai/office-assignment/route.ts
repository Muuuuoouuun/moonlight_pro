import { validateSharedWebhookRequest } from '../../../../lib/shared-webhook.ts';
import { createOfficeRoutingEngineHandler } from '../../../../lib/office/routing.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = createOfficeRoutingEngineHandler(validateSharedWebhookRequest);
