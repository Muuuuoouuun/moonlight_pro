import { createOfficeMeetingHandler } from '@/lib/office/meeting-http.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const POST=createOfficeMeetingHandler('turn');
