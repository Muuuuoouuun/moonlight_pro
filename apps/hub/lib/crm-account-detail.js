export function buildAccountRelationshipDetail(account, ledger = {}) {
  const companyId = account?.companyId || null;
  if (!companyId) return { contacts: [], deals: [] };

  const contacts = (Array.isArray(ledger.contacts) ? ledger.contacts : [])
    .filter((contact) => contact.companyId === companyId)
    .map((contact) => ({
      id: contact.id,
      name: contact.name,
      role: contact.title || "담당자",
      email: contact.email || null,
      phone: contact.phone || null,
      lastContact: contact.last || "—",
      labels: Array.isArray(contact.labels) ? contact.labels : [],
    }));

  const deals = (Array.isArray(ledger.deals) ? ledger.deals : [])
    .filter((deal) => deal.companyId === companyId);

  return { contacts, deals };
}
