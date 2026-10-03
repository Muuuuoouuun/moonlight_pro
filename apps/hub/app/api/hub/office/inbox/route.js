import { createOfficeInboxHandler } from '@/lib/office/inbox-http.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = createOfficeInboxHandler();
