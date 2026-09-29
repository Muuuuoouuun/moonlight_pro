import { createOfficeRoutingHubHandler } from '@/lib/office/routing-http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = createOfficeRoutingHubHandler();
