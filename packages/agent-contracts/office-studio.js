// Browser-safe eligibility only. Engine chooses and records the actual policy.
export const OFFICE_STUDIO_POLICY_VERSION = '2026-09-21.studio-v1';
export function isOfficeStudioOperation(operation, target) {
  return ['draft', 'polish'].includes(operation) && target?.channel === 'threads'
    && ['threads_post', 'x_thread', 'social_post'].includes(target?.variantType);
}
