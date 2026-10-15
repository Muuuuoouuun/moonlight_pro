import { resolveDefaultWorkspaceId } from '@com-moon/supabase-rest';
import { officeMeetingRpc } from '../repositories/office-meetings.js';
import { readOfficeContext } from '../repositories/office-context.js';
import { recordAgentRun } from '../sales-os/agent-runs.js';
import { callOfficeEngine } from './engine-client.js';
import { createOfficeMeetingService } from './meeting-service.js';

// The middleware authenticates Hub and the desktop session. This fixed owner is
// shared with local_skill_requests; client bodies cannot select an identity.
export function officeMeetingIdentity() {
 return { workspaceId:resolveDefaultWorkspaceId(), operatorId:'operator' };
}
export function createOfficeMeetingRuntime({rpc=officeMeetingRpc,readContext=readOfficeContext,recordRun=recordAgentRun,engineOptions={}}={}) {
 return createOfficeMeetingService({
  rpc, readContext,
  generate:(request,context)=>callOfficeEngine(request,context,{...engineOptions,retries:0,unknownOnTransportFailure:true}),
  engineConfigured:()=>Boolean((engineOptions.engineUrl ?? process.env.COM_MOON_ENGINE_URL)?.trim() && (engineOptions.secret ?? process.env.COM_MOON_SHARED_WEBHOOK_SECRET)?.trim()),
  recordRun,
 });
}
export const officeMeetingService = createOfficeMeetingRuntime();
