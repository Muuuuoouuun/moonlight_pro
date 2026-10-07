import { invokeSupabaseRpc } from '@com-moon/supabase-rest';

// Meeting reads go through the same narrowly granted RPCs as writes. No caller
// receives table rows, SQL errors, attempt tokens, or a service credential.
export async function officeMeetingRpc(name, params, { invoke = invokeSupabaseRpc } = {}) {
 const response = await invoke(name,params);
 if (!response.ok || !response.data || typeof response.data !== 'object' || typeof response.data.status !== 'string') {
  const error = new Error('office-meeting-storage-unavailable');
  error.preparation = response.error === 'missing-config' || response.status === 404;
  throw error;
 }
 return response.data;
}
