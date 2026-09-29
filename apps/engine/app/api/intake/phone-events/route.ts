// 갤럭시(MacroDroid·Tasker) → Engine: 통화 종료·문자·카톡 알림을 받아 등록 고객과 맞는 것만
// "기록 후보"로 남긴다. 설정·한계는 docs/guides/galaxy-phone-capture.md.
import { resolveDefaultWorkspaceId } from '@com-moon/supabase-rest';

import { handlePhoneEventIntake } from '../../../../lib/phone-capture-http.ts';
import {
  countPhoneDiscard,
  loadPhoneDirectory,
  redactExpiredPhoneEvents,
  storePhoneCandidate,
} from '../../../../lib/phone-capture-store.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const workspaceId = resolveDefaultWorkspaceId();
  return handlePhoneEventIntake(req, {
    secret: process.env.COM_MOON_PHONE_INTAKE_SECRET,
    workspaceId,
    loadDirectory: () => loadPhoneDirectory(workspaceId),
    store: (row) => storePhoneCandidate(row, workspaceId),
    countDiscard: (type, now) => countPhoneDiscard(type, now, workspaceId),
    afterStore: (now) => redactExpiredPhoneEvents(now, workspaceId),
  });
}
