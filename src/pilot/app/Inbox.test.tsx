import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { Inbox } from './Inbox'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const SIG = { id: 's2', short_code: 'LK', display_name: 'L', is_admin: false, active: true }
const PUBLISHED = {
  id: 'h1', service_date: '2026-07-10', source_shift: 'frueh', source_department: 'front-office',
  target_shift: 'spaet', target_department: 'front-office', status: 'published', version: 2,
}

describe('Inbox', () => {
  test('lists published handovers for the current target context and acknowledges', async () => {
    const fake = fakeSupabase({
      tables: { handovers: [PUBLISHED] },
      rpc: { acknowledge_handover: () => ({ data: { ...PUBLISHED, status: 'acknowledged' } }) },
    })
    render(<Inbox api={createPilotApi(fake.client)} signature={SIG}
                  now={() => new Date('2026-07-10T13:00:00Z')} />)
    await waitFor(() => expect(screen.getByText(/Früh Front Office/)).toBeTruthy())
    fireEvent.click(screen.getByText('Übernahme bestätigen'))
    await waitFor(() => expect(screen.getByText('Übernommen')).toBeTruthy())
    expect(fake.calls.find((c) => c.fn === 'acknowledge_handover')!.args)
      .toMatchObject({ p_handover_id: 'h1', p_signature_id: 's2' })
  })
})
