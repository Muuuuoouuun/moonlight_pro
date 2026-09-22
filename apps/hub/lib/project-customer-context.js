import { isCanonicalUuid } from './uuid.js';

export function projectCustomerRef(value) {
  if (!isCanonicalUuid(value?.id)) return null;
  const kind = value.type === 'customer_account' || value.type === 'account' ? 'account'
    : value.type === 'lead' ? 'lead' : null;
  return kind ? { type: kind, id: value.id.toLowerCase() } : null;
}

export function projectCustomerHref(value) {
  const ref = projectCustomerRef(value);
  return ref ? `/dashboard/revenue/customers?customer=${encodeURIComponent(`${ref.type}:${ref.id}`)}` : null;
}

export function projectCustomerPatch(project, customer) {
  if (!isCanonicalUuid(project?.id) || !project.updatedAt) throw Error('프로젝트를 다시 불러온 뒤 연결해 주세요.');
  const ref = customer === null ? null : projectCustomerRef(customer);
  if (customer !== null && !ref) throw Error('연결할 고객을 선택해 주세요.');
  return {
    id: project.id,
    expectedUpdatedAt: project.updatedAt,
    entityRef: ref ? { type: ref.type === 'account' ? 'customer_account' : 'lead', id: ref.id } : null,
  };
}

// Only a customer-specific entry point adds the customer. General project notes
// stay project-only, even when the project has a customer attached.
export function projectMemoContexts(project, customer = null) {
  const contexts = isCanonicalUuid(project?.id) ? [{ type: 'project', id: project.id, label: project.name }] : [];
  const ref = projectCustomerRef(customer);
  if (ref) contexts.push({ ...ref, label: customer.label || customer.name || '고객' });
  return contexts;
}

export function contextMemoKey(contexts = []) {
  return contexts.map(({ type, id }) => `${type}:${id}`).sort().join('|');
}
