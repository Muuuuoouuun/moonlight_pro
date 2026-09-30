import type { OfficeId } from './office.js';

export interface OfficeRoleMetadata {
  readonly id: OfficeId;
  readonly name: string;
  readonly role: string;
  readonly responsibility: string;
  readonly starters: readonly string[];
  readonly handoff: string;
}

export const OFFICE_ROLE_CATALOG_VERSION: string;
export const OFFICE_ROLE_CATALOG: Readonly<Record<OfficeId, OfficeRoleMetadata>>;
export const OFFICE_NOTICE_OWNERS: Readonly<{ inquiry: 'flareon'; calendar: 'vaporeon' }>;
export function officeNoticeOwner(kind: string, actualOwnerId?: string | null): OfficeId | null;
