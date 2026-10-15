export function summarizeSocialAccountStatus({
  rows = [],
  configured,
  available,
  selector = () => true,
  summarize,
  connectedStatus = () => "connected",
}) {
  const summarizeHealth = (row) => {
    const summary = summarize(row);
    return { ...summary, tokenStatus: row.status === "connected"
      ? connectedStatus(row, summary) : row.status || "pending" };
  };
  const selected = rows.find(selector) || null;
  const connection = selected ? summarizeHealth(selected) : null;
  return {
    status: !available ? "storage-error"
      : !configured ? "missing-config"
        : selected?.status === "connected" ? connection.tokenStatus
          : "ready",
    connection,
    connections: rows.map(summarizeHealth),
  };
}
