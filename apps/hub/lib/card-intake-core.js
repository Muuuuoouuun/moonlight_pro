// Pure business-card → intake normalization + disposition. No I/O.
// Imported by both the Next.js Hub (via repository wrapper) and the
// `check:cards` node self-test, so it stays relative-import + side-effect free.
import { normalizePhone, computeMatchKey } from "./sheets-normalize.js";

function clean(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Map Gemini-extracted card fields to a lead_intake_raw `normalized` shape and a
// disposition. Atom = institution(company) + decision-maker(contact).
//   promote  : >= 2 of {company, contact, phone} present (auto-add)
//   review   : identifiable but thin (1 field) — needs a look before promoting
//   rejected : no contact name AND no phone — can't identify a person/number
export function buildCardIntake(extracted = {}) {
  const name = clean(extracted.company); // intake.name = institution
  const contact = clean(extracted.name); // decision-maker
  const phone = normalizePhone(extracted.phone);
  const email = clean(extracted.email);
  const title = clean(extracted.title);
  const address = clean(extracted.address);

  const normalized = {
    name,
    contact_name: contact,
    phone,
    email,
    title,
    address,
    status: "new",
    source: "business_card",
  };

  const matchKey = computeMatchKey({ phone: extracted.phone, name, address });

  const present = [name, contact, phone].filter(Boolean).length;
  let disposition;
  if (!contact && !phone) {
    disposition = "rejected";
  } else if (present >= 2) {
    disposition = "promote";
  } else {
    disposition = "review";
  }

  return { normalized, matchKey, disposition };
}
