import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { ReviewPublish } from './ReviewPublish'
import { createPilotApi, type HandoverRow } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const SIG = { id: 's1', short_code: 'AB', display_name: 'A', is_admin: false, active: true }
const H: HandoverRow = {
  id: 'h1', service_date: '2026-07-10', source_shift: 'frueh', source_department: 'front-office',
  target_shift: 'spaet', target_department: 'front-office', status: 'draft', version: 1,
  organization_id: 'o1', author_signature_id: 's1',
  published_at: null, published_by_signature_id: null,
  acknowledged_at: null, acknowledged_by_signature_id: null,
}
const OPEN = { id: 't1', status: 'open', priority: 'wichtig', carry_over_from_task_id: null }
const CARRIED_IN = { id: 't2', status: 'open', priority: 'normal', carry_over_from_task_id: 't0' }

describe('ReviewPublish', () => {
  test('summarises open/wichtig/carry-over counts and publishes with version', async () => {
    const fake = fakeSupabase({
      rpc: { publish_handover: () => ({ data: { ...H, status: 'published', version: 2 } }) },
    })
    const changed: unknown[] = []
    render(<ReviewPublish api={createPilotApi(fake.client)} signature={SIG}
                          handover={H} tasks={[OPEN, CARRIED_IN]} onChanged={(h) => changed.push(h)} />)
    expect(screen.getByText('Offen: 2 · Wichtig: 1 · Übertragen: 1')).toBeTruthy()
    fireEvent.click(screen.getByText('Übergabe veröffentlichen'))
    await waitFor(() => expect(changed).toHaveLength(1))
    expect(fake.calls[0]!.args).toMatchObject({ p_handover_id: 'h1', p_expected_version: 1 })
  })
  test('conflict shows the reload hint, no success state', async () => {
    const fake = fakeSupabase({
      rpc: { publish_handover: () => ({ error: { code: 'P0409', message: 'conflict' } }) },
    })
    render(<ReviewPublish api={createPilotApi(fake.client)} signature={SIG}
                          handover={H} tasks={[]} onChanged={() => {}} />)
    fireEvent.click(screen.getByText('Übergabe veröffentlichen'))
    await waitFor(() =>
      expect(screen.getByText('Inhalt wurde zwischenzeitlich geändert. Neu geladen – bitte prüfen.')).toBeTruthy())
  })
})
