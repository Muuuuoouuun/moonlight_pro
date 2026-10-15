import { invokeSupabaseRpc } from '../server-write.js';

export function createGoreTestRepository({ workspaceId, rpc = invokeSupabaseRpc } = {}) {
  return {
    async command(action, input) {
      try {
        const result = await rpc('gore_threads_test_job_v1', { p_workspace_id: workspaceId, p_action: action, p_input: input }, { timeoutMs: 10000 });
        if (!result.ok || !result.data || typeof result.data !== 'object') throw Error();
        return result.data;
      } catch { throw Error('job-storage-unconfirmed'); }
    },
  };
}
