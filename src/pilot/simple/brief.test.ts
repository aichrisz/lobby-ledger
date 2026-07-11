import { describe, expect, test } from 'vitest'
import { buildBrief } from './brief'

test('handover text includes service date, Kürzel, and task statuses', () => {
  expect(buildBrief('2026-07-11', 'AB', [
    { id: '1', text: 'Schlüssel prüfen', status: 'open', createdAt: '2026-07-11T08:00:00Z' },
    { id: '2', text: 'Kasse abschließen', status: 'done', createdAt: '2026-07-11T09:00:00Z' },
  ])).toBe('Lobby Ledger – Übergabe\nDatum: 11.07.2026\nKürzel: AB\n\n[ ] Schlüssel prüfen\n[x] Kasse abschließen')
})
