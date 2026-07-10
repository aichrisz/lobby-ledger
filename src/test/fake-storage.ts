export interface FakeStorage {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
  dump(): Record<string, string>
}

export function fakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v) },
    removeItem: (k) => { map.delete(k) },
    dump: () => Object.fromEntries(map),
  }
}

export function failingStorage(): FakeStorage {
  const inner = fakeStorage()
  return {
    ...inner,
    setItem: () => { throw new DOMException('quota', 'QuotaExceededError') },
  }
}
