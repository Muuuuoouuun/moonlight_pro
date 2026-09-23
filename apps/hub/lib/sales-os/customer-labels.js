// Customer-level genre labels are operator-entered search facets, separate from
// the fixed 12-key subject vocabulary and from CRM lifecycle/status badges.
export const CUSTOMER_LABEL_MISSING = 'missing:';

export function normalizeGenreLabels(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const labels = [];
  for (const value of values) {
    const label = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const key = label.toLocaleLowerCase('ko');
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
    if (labels.length === 12) break;
  }
  return labels;
}

export function customerRegionOptions(rows) {
  const regions = [...new Set(rows.map((row) => String(row.region || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
  const sido = [...new Set(regions.map((region) => region.split('-')[0].trim()))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
  return [
    { value: '', label: '전체 지역' },
    { value: CUSTOMER_LABEL_MISSING, label: '지역 미입력' },
    ...sido.flatMap((name) => [
      { value: `sido:${name}`, label: `${name} 전체` },
      ...regions.filter((region) => region.startsWith(`${name}-`))
        .map((region) => ({ value: `exact:${region}`, label: region })),
    ]),
  ];
}

export function customerGenreOptions(rows) {
  const labels = new Map();
  for (const row of rows) {
    for (const label of row.genres || []) {
      const key = label.toLocaleLowerCase('ko');
      if (!labels.has(key)) labels.set(key, label);
    }
  }
  return [
    { value: '', label: '전체 장르' },
    { value: CUSTOMER_LABEL_MISSING, label: '장르 미입력' },
    ...[...labels.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
      .map(([value, label]) => ({ value: `genre:${value}`, label })),
  ];
}

export function matchesCustomerLabels(row, { region = '', subject = '', genre = '' } = {}) {
  const actualRegion = String(row.region || '').trim();
  if (region === CUSTOMER_LABEL_MISSING && actualRegion) return false;
  if (region.startsWith('sido:') && actualRegion.split('-')[0] !== region.slice(5)) return false;
  if (region.startsWith('exact:') && actualRegion !== region.slice(6)) return false;
  if (subject === CUSTOMER_LABEL_MISSING && (row.subjects || []).length) return false;
  if (subject && subject !== CUSTOMER_LABEL_MISSING && !(row.subjects || []).includes(subject)) return false;
  if (genre === CUSTOMER_LABEL_MISSING && (row.genres || []).length) return false;
  if (genre && genre !== CUSTOMER_LABEL_MISSING && !(row.genres || []).some((label) => label.toLocaleLowerCase('ko') === (genre.startsWith('genre:') ? genre.slice(6) : genre))) return false;
  return true;
}
