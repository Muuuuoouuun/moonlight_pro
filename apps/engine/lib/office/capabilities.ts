import { OFFICE_ROSTER } from '@com-moon/agent-contracts/office';
import { getOfficeRoleCard, OFFICE_ROLE_CARD_VERSION, type OfficeRoleCard } from './role-cards.ts';

export type OfficeFunctionalCapability = Pick<OfficeRoleCard,
  'id' | 'mission' | 'ownership' | 'expertise' | 'deliverables' | 'boundaries' | 'handoffs' | 'deliberation'
> & { readonly name: string; readonly role: string };

// Project the existing frozen card's job contract; voice and examples stay out
// of allocation. This describes judgment, drafting and review, never tools or
// permission to execute the workflows named by a card.
export const OFFICE_CAPABILITY_VERSION = OFFICE_ROLE_CARD_VERSION;
export const OFFICE_ROUTING_CAPABILITIES: readonly Readonly<OfficeFunctionalCapability>[] = Object.freeze(
  OFFICE_ROSTER.map(({ id, name, role }) => {
    const { mission, ownership, expertise, deliverables, boundaries, handoffs, deliberation } = getOfficeRoleCard(id);
    return Object.freeze({ id, name, role, mission, ownership, expertise, deliverables, boundaries, handoffs, deliberation });
  }),
);
