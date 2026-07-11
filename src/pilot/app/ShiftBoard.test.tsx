import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { ShiftBoard } from './ShiftBoard'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const SIG = { id: 's1', short_code: 'AB', display_name: 'A', is_admin: false, active: true }
const H = {
  id: 'h1', service_date: '2026-07-10', source_shift: 'frueh', source_department: 'front-office',
  target_shift: 'spaet', target_department: 'front-office', status: 'published', version: 2,
}

describe('ShiftBoard', () => {
  test('shows today (Berlin) with three shift columns and handover status', async () => {
    const fake = fakeSupabase({ tables: { handovers: [H] } })
    render(<ShiftBoard api={createPilotApi(fake.client)} signature={SIG}
                       now={() => new Date('2026-07-10T09:00:00Z')} />)
    expect(screen.getByText('Fr, 10.07.2026')).toBeTruthy()
    expect(screen.getByText('Früh')).toBeTruthy()
    expect(screen.getByText('Spät')).toBeTruthy()
    expect(screen.getByText('Nacht')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Veröffentlicht')).toBeTruthy())
  })
  test('date navigation moves a day back and forward', async () => {
    const fake = fakeSupabase({ tables: { handovers: [] } })
    render(<ShiftBoard api={createPilotApi(fake.client)} signature={SIG}
                       now={() => new Date('2026-07-10T09:00:00Z')} />)
    fireEvent.click(screen.getByLabelText('Vorheriger Tag'))
    expect(screen.getByText('Do, 09.07.2026')).toBeTruthy()
    fireEvent.click(screen.getByText('Heute'))
    expect(screen.getByText('Fr, 10.07.2026')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Nächster Tag'))
    expect(screen.getByText('Sa, 11.07.2026')).toBeTruthy()
  })
  test('without a signature, creating a draft is blocked with a prompt', () => {
    const fake = fakeSupabase({ tables: { handovers: [] } })
    render(<ShiftBoard api={createPilotApi(fake.client)} signature={null}
                       now={() => new Date('2026-07-10T09:00:00Z')} />)
    fireEvent.click(screen.getAllByText('Übergabe beginnen')[0]!)
    expect(screen.getByText(/Kürzel wählen oder anlegen/)).toBeTruthy()
  })
})
