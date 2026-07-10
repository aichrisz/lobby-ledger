import { describe, expect, test } from 'vitest'
import { containsLikelyContact, parseSignatureInput } from './signature'

describe('parseSignatureInput', () => {
  test('uppercases and trims a valid Kürzel + name', () => {
    expect(parseSignatureInput({ shortCode: ' ab ', displayName: '  Rezeption A ' }))
      .toEqual({ shortCode: 'AB', displayName: 'Rezeption A' })
  })
  test('accepts umlauts, 2–4 letters', () => {
    expect(parseSignatureInput({ shortCode: 'ÖZ', displayName: 'Ö' })).not.toBeNull()
    expect(parseSignatureInput({ shortCode: 'ABCD', displayName: 'X' })).not.toBeNull()
  })
  test.each([
    ['too short', 'A', 'Name'],
    ['too long', 'ABCDE', 'Name'],
    ['digits', 'A1', 'Name'],
    ['empty name', 'AB', '   '],
    ['overlong name', 'AB', 'x'.repeat(41)],
  ])('rejects %s', (_n, shortCode, displayName) => {
    expect(parseSignatureInput({ shortCode, displayName })).toBeNull()
  })
})

describe('containsLikelyContact (free-text PII tripwire)', () => {
  test.each([
    'Bitte anna.schmidt@web.de zurückrufen',
    'Rückruf +49 171 2345678',
    'Nummer 0171/2345678 hinterlegt',
  ])('flags %s', (text) => expect(containsLikelyContact(text)).toBe(true))

  test.each([
    'Taxi 06:30 bestellt',
    'Zimmer 204 Wasserkocher defekt',
    'Rechnung 2026-4711 klären',
    'Anreise ca. 23 Uhr',
  ])('passes %s', (text) => expect(containsLikelyContact(text)).toBe(false))
})
