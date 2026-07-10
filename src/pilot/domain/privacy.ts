export const RETENTION_DAYS = 30

export function maskName(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean)
    .map((w) => `${w[0]!.toUpperCase()}.`).join(' ')
}

export function maskContact(type: 'phone' | 'email', value: string): string {
  return type === 'phone' ? `••• ${value.slice(-2)}` : `${value[0] ?? ''}•••`
}

export function retentionExpiry(completedAtIso: string): string {
  return new Date(Date.parse(completedAtIso) + RETENTION_DAYS * 86_400_000).toISOString()
}
