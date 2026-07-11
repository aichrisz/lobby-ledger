export type LedgerShift = 'frueh' | 'spaet' | 'nacht'
export type LedgerDepartment = 'front-office' | 'housekeeping' | 'restaurant'
export type LedgerPriority = 'normal' | 'wichtig'
export interface NewLedgerTask {
  text: string
  ref: string
  department: LedgerDepartment
  priority: LedgerPriority
}
export interface LedgerTask extends NewLedgerTask {
  id: string
  status: 'open' | 'done'
  createdAt: string
  createdShift: LedgerShift
  doneAt: string | null
}
export class UnauthorizedError extends Error {}
export interface LedgerApi {
  unlock(pin: string): Promise<void>
  list(date: string, shift: LedgerShift): Promise<LedgerTask[]>
  create(date: string, shift: LedgerShift, initials: string, task: NewLedgerTask): Promise<LedgerTask>
  setStatus(id: string, date: string, shift: LedgerShift, initials: string, status: 'open' | 'done'): Promise<LedgerTask>
  delete(id: string, date: string, shift: LedgerShift, initials: string): Promise<void>
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: init.body ? { 'Content-Type': 'application/json', 'X-Lobby-Ledger': '1' } : undefined,
  })
  if (response.status === 401) throw new UnauthorizedError('PIN erforderlich')
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: unknown }
    throw new Error(typeof body.error === 'string' ? body.error : 'Anfrage fehlgeschlagen')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function createLedgerApi(): LedgerApi {
  return {
    async unlock(pin) {
      await request('/api/pin', { method: 'POST', body: JSON.stringify({ pin }) })
    },
    async list(date, shift) {
      const result = await request<{ tasks: LedgerTask[] }>('/api/ledger', {
        method: 'POST', body: JSON.stringify({ operation: 'read', date, shift }),
      })
      return result.tasks
    },
    async create(date, shift, initials, task) {
      const result = await request<{ task: LedgerTask }>('/api/ledger', {
        method: 'POST', body: JSON.stringify({ date, shift, initials, ...task }),
      })
      return result.task
    },
    async setStatus(id, date, shift, initials, status) {
      const result = await request<{ task: LedgerTask }>(`/api/ledger?id=${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify({ date, shift, initials, status }),
      })
      return result.task
    },
    async delete(id, date, shift, initials) {
      await request(`/api/ledger?id=${encodeURIComponent(id)}`, {
        method: 'DELETE', body: JSON.stringify({ date, shift, initials }),
      })
    },
  }
}
