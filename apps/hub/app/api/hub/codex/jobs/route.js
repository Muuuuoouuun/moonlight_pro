import {createHubJobHandler} from '@/lib/agent/hub-jobs-http.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=createHubJobHandler();
export const POST=createHubJobHandler();
