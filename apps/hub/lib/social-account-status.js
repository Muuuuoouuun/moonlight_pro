export function summarizeSocialAccountStatus({
  rows = [],
  configured,
  available,
  selector = () => true,
  summarize,
  connectedStatus = () => "connected",
}) {
  const selected = rows.find(selector) || null;
  const connection = selected ? summarize(selected) : null;
  return {
    status: !available ? "storage-error"
      : !configured ? "missing-config"
        : selected?.status === "connected" ? connectedStatus(selected, connection)
          : "ready",
    connection,
    connections: rows.map(summarize),
  };
}
