import { invokeSupabaseRpc } from '@com-moon/supabase-rest';
import { createOfficeInboxService } from './inbox-service.js';

export const officeInboxService = createOfficeInboxService({
  rpc: async (name, params) => {
    const result = await invokeSupabaseRpc(name, params);
    if (!result.ok || !result.data || typeof result.data !== 'object') {
      const error = new Error('office-storage-unavailable');
      error.preparation = result.error === 'missing-config' || result.status === 404
        || /(?:office_|relation).*?(?:does not exist|schema cache)|could not find.*?office_/i.test(result.detail || '');
      throw error;
    }
    return result.data;
  },
});
