export type PilotErrorKind = 'forbidden' | 'not-found' | 'conflict' | 'validation' | 'network' | 'unknown'
export interface PilotError { kind: PilotErrorKind; message: string }

const BY_CODE: Record<string, PilotErrorKind> = {
  P0403: 'forbidden', P0404: 'not-found', P0409: 'conflict', P0422: 'validation',
  '23514': 'validation', '23505': 'validation', '23503': 'validation', '42501': 'forbidden',
}

export function mapDbError(err: { code?: string; message: string }): PilotError {
  if (err.code && BY_CODE[err.code]) return { kind: BY_CODE[err.code]!, message: err.message }
  if (/fetch|network/i.test(err.message)) return { kind: 'network', message: err.message }
  return { kind: 'unknown', message: err.message }
}
