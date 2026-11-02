import { invokeSupabaseRpc } from '../server-write.js';

// threads_publish_job_v1 한 곳으로만 읽고 쓴다(0073). 실패는 저장 확인 실패 하나로 접는다.
export function createThreadsPublishRepository({ workspaceId, rpc = invokeSupabaseRpc } = {}) {
  return {
    async command(action, input) {
      try {
        const result = await rpc('threads_publish_job_v1', { p_workspace_id: workspaceId, p_action: action, p_input: input }, { timeoutMs: 10000 });
        if (!result.ok || !result.data || typeof result.data !== 'object') throw Error();
        return result.data;
      } catch { throw Error('job-storage-unconfirmed'); }
    },
  };
}
