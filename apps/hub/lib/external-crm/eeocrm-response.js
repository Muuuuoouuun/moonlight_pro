export function extractEeocrmRecords(parsed) {
  const records =
    parsed?.data?.records ||
    parsed?.result?.records ||
    parsed?.records ||
    [];

  return Array.isArray(records) ? records : [];
}
