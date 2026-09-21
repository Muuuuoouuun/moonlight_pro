import { createOfficeWorkflowHandler } from '@/lib/office/workflow-http.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = createOfficeWorkflowHandler('receipt');
