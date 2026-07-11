import { describe, expect, test } from 'vitest'
import { render, screen, waitFor } from '@testing-library/preact'
import { AdminPanel } from './AdminPanel'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const ADMIN = { id: 's1', short_code: 'AB', display_name: 'A', is_admin: true, active: true }

describe('AdminPanel', () => {
  test('non-admin signature sees the block message', () => {
    const fake = fakeSupabase()
    render(<AdminPanel api={createPilotApi(fake.client)} signature={{ ...ADMIN, is_admin: false }} />)
    expect(screen.getByText('Nur für die Pilotleitung (Admin-Kürzel).')).toBeTruthy()
  })
  test('admin sees retention health and audit list; failure is called out', async () => {
    const fake = fakeSupabase({
      rpc: {
        retention_health: () => ({ data: [{ last_ran_at: '2026-07-10T02:15:00Z', last_ok: false, last_error: 'boom', overdue_cases: 2 }] }),
        list_audit_events: () => ({ data: [{ id: 1, action: 'handover.published', occurred_at: '2026-07-10T06:10:00Z', entity_type: 'handover', entity_id: 'h1' }] }),
      },
      tables: { staff_signatures: [ADMIN] },
    })
    render(<AdminPanel api={createPilotApi(fake.client)} signature={ADMIN} />)
    await waitFor(() => expect(screen.getByText('Löschlauf fehlgeschlagen – bitte prüfen.')).toBeTruthy())
    expect(screen.getByText('handover.published')).toBeTruthy()
  })
})
