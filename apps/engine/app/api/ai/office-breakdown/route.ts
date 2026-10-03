import { validateSharedWebhookRequest } from '../../../../lib/shared-webhook.ts';
import { createOfficeBreakdownEngineHandler } from '../../../../lib/office/breakdown.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = createOfficeBreakdownEngineHandler(validateSharedWebhookRequest);
