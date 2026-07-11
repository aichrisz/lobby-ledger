import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { Archive } from './Archive'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const SIG = { id: 's1', short_code: 'AB', display_name: 'A', is_admin: false, active: true }
const H = {
  id: 'h1', service_date: '2026-07-08', source_shift: 'frueh', source_department: 'front-office',
  target_shift: 'spaet', target_department: 'front-office', status: 'acknowledged', version: 3,
}

describe('Archive', () => {
  test('lists prior handovers and copies a non-PII metrics summary', async () => {
    const fake = fakeSupabase({
      tables: { handovers: [H] },
      rpc: { pilot_metrics: () => ({ data: { handovers: 1, published: 1, acknowledged: 1, tasks: 4, carried_over: 1, template_usage: { technik: 2 } } }) },
    })
    render(<Archive api={createPilotApi(fake.client)} signature={SIG} />)
    await waitFor(() => expect(screen.getByText(/Mi, 08.07.2026/)).toBeTruthy())
    fireEvent.click(screen.getByText('Pilot-Kennzahlen kopieren'))
    await waitFor(() => expect(screen.getByText('Kopiert ✓')).toBeTruthy())
  })
})
