import { validateSharedWebhookRequest } from '../../../../lib/shared-webhook.ts';
import { createOfficeWorkflowEngineHandler } from '../../../../lib/office/workflow-http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = createOfficeWorkflowEngineHandler(validateSharedWebhookRequest);
