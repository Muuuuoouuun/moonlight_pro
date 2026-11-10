import { createOfficeVerdictHandler } from '@/lib/office/verdict.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = createOfficeVerdictHandler();
