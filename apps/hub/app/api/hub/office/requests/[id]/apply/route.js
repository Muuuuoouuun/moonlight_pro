import { createOfficeWorkflowHandler } from '@/lib/office/workflow-http.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = createOfficeWorkflowHandler('apply');
