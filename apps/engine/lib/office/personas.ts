import { OFFICE_IDS, type OfficeId } from '@com-moon/agent-contracts/office';
import { OFFICE_ROLE_CARD_VERSION, renderOfficeRolePersona } from './role-cards.ts';

export const OFFICE_PERSONA_VERSION = OFFICE_ROLE_CARD_VERSION;

// The runtime voice and the inspectable role artifact have one source of truth.
export const OFFICE_PERSONAS: Record<OfficeId, string> = Object.fromEntries(
  OFFICE_IDS.map(id => [id, renderOfficeRolePersona(id)]),
) as Record<OfficeId, string>;
