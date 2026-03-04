export type ClientSearchItem = {
  id: string;
  name: string;
  email?: string | null;
};

/**
 * Filter clients by query (case-insensitive match on name and email).
 */
export function filterClients(
  clients: ClientSearchItem[],
  query: string
): ClientSearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return clients;
  return clients.filter((c) => {
    const nameMatch = c.name.toLowerCase().includes(q);
    const emailMatch = c.email != null && c.email.toLowerCase().includes(q);
    return nameMatch || emailMatch;
  });
}
