import { createHubSkillRequestHandler } from '@/lib/skill-requests-http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = createHubSkillRequestHandler('list');
export const POST = createHubSkillRequestHandler('create');
