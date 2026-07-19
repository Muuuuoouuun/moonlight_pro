import assert from "node:assert/strict";
import test from "node:test";

import { buildAccountRelationshipDetail } from "./crm-account-detail.js";

test("builds a person-first account detail from linked contacts and deals", () => {
  const detail = buildAccountRelationshipDetail(
    { id: "account-1", companyId: "company-1" },
    {
      contacts: [
        {
          id: "contact-1",
          companyId: "company-1",
          name: "김원장",
          title: "원장",
          email: "owner@example.com",
          phone: "010-0000-0000",
          last: "어제",
          labels: ["의사결정자"],
        },
        { id: "contact-2", companyId: "company-2", name: "다른 고객" },
      ],
      deals: [
        { id: "deal-1", companyId: "company-1", name: "ClassIn 도입", stage: "quote", value: 4200000 },
        { id: "deal-2", companyId: "company-2", name: "다른 딜", stage: "contact", value: 0 },
      ],
    },
  );

  assert.deepEqual(detail.contacts, [
    {
      id: "contact-1",
      name: "김원장",
      role: "원장",
      email: "owner@example.com",
      phone: "010-0000-0000",
      lastContact: "어제",
      labels: ["의사결정자"],
    },
  ]);
  assert.deepEqual(detail.deals, [
    { id: "deal-1", companyId: "company-1", name: "ClassIn 도입", stage: "quote", value: 4200000 },
  ]);
});

test("keeps account detail honest when no company relationship is available", () => {
  assert.deepEqual(
    buildAccountRelationshipDetail(
      { id: "account-1", companyId: null },
      { contacts: [{ companyId: null, name: "추측 금지" }], deals: [{ companyId: null, name: "추측 금지" }] },
    ),
    { contacts: [], deals: [] },
  );
});
