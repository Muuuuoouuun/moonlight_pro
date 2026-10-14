import { createOfficeMeetingHandler } from '@/lib/office/meeting-http.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=createOfficeMeetingHandler('get');
export const PATCH=createOfficeMeetingHandler('update');
