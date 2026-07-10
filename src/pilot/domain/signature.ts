export const SHORT_CODE_PATTERN = /^[A-ZÄÖÜ]{2,4}$/
export const DISPLAY_NAME_MAX = 40

export interface SignatureInput { shortCode: string; displayName: string }

export function parseSignatureInput(raw: SignatureInput): SignatureInput | null {
  const shortCode = raw.shortCode.trim().toUpperCase()
  const displayName = raw.displayName.trim()
  if (!SHORT_CODE_PATTERN.test(shortCode)) return null
  if (displayName.length === 0 || displayName.length > DISPLAY_NAME_MAX) return null
  return { shortCode, displayName }
}

/**
 * Mirrors the DB CHECK on handover_tasks.text: emails and 9+-digit runs
 * (with separators) are contact data and belong in a purpose-gated guest case.
 */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/
const PHONE = /\+?(?:\d[\s/.\-]*){8}\d/

export function containsLikelyContact(text: string): boolean {
  return EMAIL.test(text) || PHONE.test(text)
}
