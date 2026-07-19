import { createHash } from "node:crypto";

const SOURCE_VERSION = "rev-row-v1";

function normalizeText(value) {
  const text = String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
  return text && text !== "-" ? text : null;
}

function normalizeKey(value) {
  return normalizeText(value)?.toLowerCase() ?? null;
}

function normalizeEnum(value, values) {
  const key = normalizeKey(value);
  return key && values.has(key) ? key : null;
}

function normalizeScale(value) {
  const scale = normalizeText(value)?.toUpperCase() ?? null;
  return new Set(["A", "B", "C", "KA"]).has(scale) ? scale : null;
}

function normalizeProduct(value) {
  const key = normalizeKey(value);
  if (key === "hardware" || key === "hw") return "hw";
  if (
    key === "software" ||
    key === "sw" ||
    key === "classin月享版" ||
    key === "flex standard" ||
    key?.includes("subscription") ||
    key?.includes("consumption")
  ) return "sw";
  return key ? "other" : null;
}

function parseAmount(value) {
  const text = normalizeText(value);
  if (!text) return { amount: null, currencySymbol: null };
  const currencySymbol = text.match(/[¥₩$€£]/u)?.[0] ?? null;
  const number = Number(text.replace(/[^\d.-]/g, ""));
  return {
    amount: Number.isFinite(number) ? number : null,
    currencySymbol,
  };
}

function normalizeMoonlightId(value) {
  const id = normalizeText(value);
  if (!id) return null;
  return id.startsWith("rev-v1:") ? id : `rev-v1:${id}`;
}

export function computeRevSourceHash(row) {
  const canonical = {
    institution_name: normalizeText(row.institutionName),
    location: normalizeText(row.location),
    scale: normalizeScale(row.scale),
    manager: normalizeText(row.manager),
    business_type: normalizeEnum(row.businessType, new Set(["new", "renew"])),
    product_type: normalizeEnum(row.productType, new Set(["hw", "sw", "other"])),
    product_name: normalizeText(row.productName),
    sales_type: normalizeKey(row.salesType),
    fiscal_period: normalizeText(row.fiscalPeriod),
    amount: Number.isFinite(Number(row.amount)) ? Number(row.amount) : null,
    currency_symbol: normalizeText(row.currencySymbol),
  };

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function mapRevRow(row, { rowNumber, fiscalPeriod } = {}) {
  const sourceKey = normalizeMoonlightId(row?.["Moonlight ID"]);
  const { amount, currencySymbol } = parseAmount(row?.Sum);
  const mapped = {
    sourceRef: Number.isInteger(rowNumber) ? `row:${rowNumber}` : null,
    sourceKey,
    sourceVersion: SOURCE_VERSION,
    identityStatus: sourceKey ? "ready" : "missing",
    institutionName: normalizeText(row?.Account),
    branch: normalizeText(row?.Branch),
    location: normalizeText(row?.Location),
    scale: normalizeScale(row?.Scale),
    importance: normalizeKey(row?.Importance),
    team: normalizeText(row?.Team),
    manager: normalizeText(row?.Manager),
    businessType: normalizeEnum(row?.Status, new Set(["new", "renew"])),
    salesType: normalizeKey(row?.Type),
    productType: normalizeProduct(row?.Product),
    productName: normalizeText(row?.Product),
    firstPayment: normalizeText(row?.["First Payment"]),
    remark: normalizeText(row?.Remark),
    fiscalPeriod: normalizeText(fiscalPeriod),
    amount,
    currencySymbol,
    rawRowNumber: Number.isInteger(rowNumber) ? rowNumber : null,
  };
  mapped.sourceHash = computeRevSourceHash(mapped);
  return mapped;
}

function lengthDelimited(value) {
  const text = String(value ?? "");
  return `${Buffer.byteLength(text, "utf8")}:${text}`;
}

export function computeRevSourceRevision(rows) {
  const encoded = (Array.isArray(rows) ? rows : [])
    .map((row) => [
      String(row?.sourceKey ?? ""),
      String(row?.sourceRef ?? ""),
      String(row?.sourceHash ?? ""),
      String(row?.identityStatus ?? "missing"),
    ])
    .sort((left, right) => {
      for (let i = 0; i < left.length; i += 1) {
        const comparison = left[i].localeCompare(right[i]);
        if (comparison) return comparison;
      }
      return 0;
    })
    .map((parts) => parts.map(lengthDelimited).join("|"))
    .join("");
  return createHash("sha256").update(encoded).digest("hex");
}

function normalizeInstitution(value) {
  return String(value ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s·.\-()]/g, "");
}

function normalizeInstitutionLoose(value) {
  return normalizeInstitution(value).replace(/(어학원|학원|아카데미|academy|스쿨|school)$/i, "");
}

function regionOf(record) {
  return normalizeText(record?.meta?.region ?? record?.address);
}

function exactCandidates(row, records) {
  const sameName = (Array.isArray(records) ? records : []).filter(
    (record) => normalizeInstitution(record?.name) === normalizeInstitution(row.institutionName),
  );
  if (sameName.length <= 1 || !row.location) return sameName;
  const sameRegion = sameName.filter((record) => normalizeInstitution(regionOf(record)) === normalizeInstitution(row.location));
  return sameRegion.length ? sameRegion : sameName;
}

function looseCandidates(row, records) {
  const needle = normalizeInstitutionLoose(row.institutionName);
  if (!needle) return [];
  return (Array.isArray(records) ? records : []).filter(
    (record) => normalizeInstitutionLoose(record?.name) === needle,
  );
}

function invalidReasons(row) {
  const reasons = [];
  if (!row.institutionName) reasons.push("missing_institution");
  if (!row.businessType) reasons.push("missing_business_type");
  if (!row.productType) reasons.push("missing_product_type");
  if (row.amount == null) reasons.push("invalid_amount");
  if (!row.scale) reasons.push("invalid_scale");
  return reasons;
}

function metadataDiff(row, target) {
  const fields = [
    ["location", row.location, target?.meta?.region ?? target?.address],
    ["manager", row.manager, target?.meta?.rev_manager],
    ["scale", row.scale, target?.meta?.scale],
  ];
  const fillFields = [];
  const conflictFields = [];
  for (const [field, sourceValue, targetValue] of fields) {
    if (!sourceValue) continue;
    if (!normalizeText(targetValue)) fillFields.push(field);
    else if (normalizeKey(sourceValue) !== normalizeKey(targetValue)) conflictFields.push(field);
  }
  return { fillFields: fillFields.sort(), conflictFields: conflictFields.sort() };
}

export function classifyRevRow(row, { companies = [], leads = [], sourceLinks = [] } = {}) {
  const result = {
    classification: "invalid",
    identityStatus: row?.identityStatus ?? "missing",
    reasonCodes: [],
    candidateCompanyIds: [],
    candidateLeadIds: [],
    fillFields: [],
    conflictFields: [],
    currentDealId: null,
  };

  const reasons = invalidReasons(row || {});
  if (reasons.length) {
    result.reasonCodes = reasons;
    return result;
  }

  if (row.sourceKey) {
    const link = sourceLinks.find((item) => item?.sourceKey === row.sourceKey);
    if (link && link.sourceHash === row.sourceHash) {
      return {
        ...result,
        classification: "unchanged",
        candidateCompanyIds: link.companyId ? [link.companyId] : [],
        candidateLeadIds: link.leadId ? [link.leadId] : [],
        currentDealId: link.dealId ?? null,
      };
    }
  }

  const companyMatches = exactCandidates(row, companies);
  const leadMatches = exactCandidates(row, leads);
  const consistentLeadMatches = leadMatches.filter((lead) => {
    if (companyMatches.length !== 1 || !lead?.company_id) return true;
    return lead.company_id === companyMatches[0].id;
  });
  result.candidateCompanyIds = companyMatches.map((item) => item.id).filter(Boolean);
  result.candidateLeadIds = consistentLeadMatches.map((item) => item.id).filter(Boolean);

  const inconsistentLead = leadMatches.length !== consistentLeadMatches.length;
  if (companyMatches.length > 1 || consistentLeadMatches.length > 1 || inconsistentLead) {
    result.classification = "ambiguous";
    if (companyMatches.length > 1) result.reasonCodes.push("multiple_company_candidates");
    if (consistentLeadMatches.length > 1 || inconsistentLead) result.reasonCodes.push("multiple_lead_candidates");
    return result;
  }

  const target = companyMatches[0] || consistentLeadMatches[0] || null;
  if (target) {
    const { fillFields, conflictFields } = metadataDiff(row, target);
    result.fillFields = fillFields;
    result.conflictFields = conflictFields;
    if (conflictFields.length) {
      result.classification = "matched_requires_approval";
      result.reasonCodes = ["source_value_conflict"];
    } else if (fillFields.length) {
      result.classification = "matched_fill_empty";
    } else {
      result.classification = "matched_no_change";
    }
    return result;
  }

  const looseCompanies = looseCandidates(row, companies);
  const looseLeads = looseCandidates(row, leads);
  if (looseCompanies.length || looseLeads.length) {
    result.classification = "ambiguous";
    result.candidateCompanyIds = looseCompanies.map((item) => item.id).filter(Boolean);
    result.candidateLeadIds = looseLeads.map((item) => item.id).filter(Boolean);
    if (looseCompanies.length) result.reasonCodes.push("multiple_company_candidates");
    if (looseLeads.length) result.reasonCodes.push("multiple_lead_candidates");
    return result;
  }

  result.classification = "new_candidate";
  return result;
}

const REV_CLASSIFICATIONS = [
  "unchanged",
  "matched_no_change",
  "matched_fill_empty",
  "matched_requires_approval",
  "new_candidate",
  "ambiguous",
  "invalid",
];

export function buildRevDryRunReport({
  values,
  companies = [],
  leads = [],
  sourceLinks = [],
  headerRowNumber = 2,
  fiscalPeriod,
  batchId,
} = {}) {
  const [header = [], ...dataRows] = Array.isArray(values) ? values : [];
  const mappedRows = dataRows
    .map((cells, index) => ({ cells, index }))
    .filter(({ cells }) => Array.isArray(cells) && cells.some((cell) => normalizeText(cell)))
    .map(({ cells, index }) => {
      const row = {};
      header.forEach((name, columnIndex) => {
        const key = normalizeText(name);
        if (key) row[key] = cells[columnIndex] ?? "";
      });
      return mapRevRow(row, {
        rowNumber: headerRowNumber + index + 1,
        fiscalPeriod,
      });
    });

  const counts = Object.fromEntries(REV_CLASSIFICATIONS.map((key) => [key, 0]));
  const rows = mappedRows.map((row) => {
    const classification = classifyRevRow(row, { companies, leads, sourceLinks });
    counts[classification.classification] += 1;
    return {
      sourceRef: row.sourceRef,
      sourceKey: row.sourceKey,
      sourceHash: row.sourceHash,
      identityStatus: row.identityStatus,
      classification: classification.classification,
      reasonCodes: classification.reasonCodes,
      candidateCompanyIds: classification.candidateCompanyIds,
      candidateLeadIds: classification.candidateLeadIds,
      currentDealId: classification.currentDealId,
      fillFields: classification.fillFields,
      conflictFields: classification.conflictFields,
    };
  });

  return {
    batchId: batchId ?? null,
    sourceRevision: computeRevSourceRevision(mappedRows),
    identityReady: mappedRows.every((row) => row.identityStatus === "ready"),
    total: rows.length,
    institutionCount: new Set(mappedRows.map((row) => normalizeText(row.institutionName)).filter(Boolean)).size,
    normalizedInstitutionCount: new Set(mappedRows.map((row) => normalizeInstitution(row.institutionName)).filter(Boolean)).size,
    counts,
    rows,
  };
}
