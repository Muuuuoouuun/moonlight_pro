import { createAgentSkillRequestHandler } from '@/lib/skill-requests-http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = createAgentSkillRequestHandler('record');
