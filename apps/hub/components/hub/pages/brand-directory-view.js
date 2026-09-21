// These filters describe operator-entered state; missing criteria are never inferred
// to mean inactive, and an empty operating state is not treated as resting.
export const BRAND_VIEW_FILTERS = [
  { key: "all", label: "전체" },
  { key: "focused", label: "집중" },
  { key: "active", label: "운영 중" },
  { key: "experimenting", label: "실험 중" },
  { key: "resting", label: "휴식 중" },
];

export function filterBrandDirectory(brands, { query = "", filter = "all" } = {}) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return brands.filter((brand) => {
    if (filter === "focused" && !brand.isFocused) return false;
    if (["active", "experimenting", "resting"].includes(filter) && brand.operatingState !== filter) return false;
    const searchable = [brand.name, brand.key, brand.promise, brand.description, brand.currentFocus, ...(brand.keywords || [])]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    return words.every((word) => searchable.includes(word));
  });
}
