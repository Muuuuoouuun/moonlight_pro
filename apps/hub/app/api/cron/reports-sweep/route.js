import { createReportsSweepHandler } from '@/lib/reports-generation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const GET = createReportsSweepHandler();
