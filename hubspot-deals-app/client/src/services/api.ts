export async function fetchJson<T>(path: string) {
  const res = await fetch(path)
  if (!res.ok) throw new Error((await res.json()).message || res.statusText)
  return (await res.json()) as T
}

export function fetchDeals() { return fetchJson<any[]>('/api/deals') }
export function fetchContacts() { return fetchJson<any[]>('/api/contacts') }
export function fetchCampaigns() { return fetchJson<any[]>('/api/campaigns') }
export function fetchTickets() { return fetchJson<any[]>('/api/tickets') }
export function fetchRealizationDeals() { return fetchJson<any[]>('/api/realization/deals') }
export function authStatus() { return fetchJson<{authenticated: boolean, expiresAt: number | null}>('/auth/status') }
