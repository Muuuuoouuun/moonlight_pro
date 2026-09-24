export function assertPersistedSocialConnection(saved) {
  if (saved?.persistence?.persisted !== true || !saved.connectionId) {
    throw new Error("connection-not-persisted");
  }

  return saved;
}
