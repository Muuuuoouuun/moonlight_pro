import { validateSharedWebhookRequest } from '../../../../lib/shared-webhook.ts';
import { createOfficeApplyHandler } from '../../../../lib/office-apply-http.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = createOfficeApplyHandler(validateSharedWebhookRequest);
