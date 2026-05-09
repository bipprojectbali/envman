export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const apiFetch = <T = any>(url: string, opts?: RequestInit): Promise<T> =>
  fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts }).then(async (r) => {
    const body = await r.json().catch(() => ({}))
    if (r.status === 401) throw new UnauthorizedError()
    if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`)
    return body as T
  })
