import { describe, expect, test } from 'vitest'
import { buildBrief } from './brief'

test('handover text includes shift and V1 task details', () => {
  expect(buildBrief('2026-07-11', 'spaet', 'AB', [
    { id: '1', text: 'Schlüssel prüfen', ref: '204', department: 'housekeeping', priority: 'wichtig', status: 'open', createdAt: '2026-07-11T08:00:00Z', createdShift: 'spaet', doneAt: null },
    { id: '2', text: 'Kasse abschließen', ref: '', department: 'front-office', priority: 'normal', status: 'done', createdAt: '2026-07-11T09:00:00Z', createdShift: 'spaet', doneAt: '2026-07-11T10:00:00Z' },
  ])).toBe('Lobby Ledger – Übergabe\nDatum: 11.07.2026\nSchicht: Spät\nKürzel: AB\n\n[!] 204 · Schlüssel prüfen (Housekeeping)\n[x] Kasse abschließen (Front Office)')
})
