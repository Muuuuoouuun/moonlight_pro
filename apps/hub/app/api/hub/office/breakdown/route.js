import { createOfficeBreakdownHubHandler } from '@/lib/office/breakdown-http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = createOfficeBreakdownHubHandler();
