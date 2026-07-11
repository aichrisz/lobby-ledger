import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { GuestCaseDrawer } from './GuestCaseDrawer'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const SIG = { id: 's1', short_code: 'AB', display_name: 'A', is_admin: false, active: true }
const MASKED = {
  id: 'g1', room_reference: '117', purpose: 'callback', purpose_note: null,
  expires_at: '2026-08-09T14:00:00Z', deleted_at: null,
  masked_name: 'T. S.', masked_contact: '••• 11', has_contact: true, has_name: true,
}

describe('GuestCaseDrawer — creation', () => {
  test('name/contact fields stay disabled until a purpose is chosen', () => {
    const fake = fakeSupabase()
    render(<GuestCaseDrawer api={createPilotApi(fake.client)} signature={SIG} caseId={null} creatable onCreated={() => {}} />)
    fireEvent.click(screen.getByText('Gastbezug (optional)'))
    expect((screen.getByLabelText('Gastname') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Bitte zuerst einen Zweck wählen, dann Name/Kontakt erfassen.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Zweck (erforderlich)'), { target: { value: 'callback' } })
    expect((screen.getByLabelText('Gastname') as HTMLInputElement).disabled).toBe(false)
  })
  test('saving calls create_guest_case and reports the id', async () => {
    const fake = fakeSupabase({ rpc: { create_guest_case: () => ({ data: 'g1' }) } })
    const created: string[] = []
    render(<GuestCaseDrawer api={createPilotApi(fake.client)} signature={SIG} caseId={null} creatable onCreated={(id) => created.push(id)} />)
    fireEvent.click(screen.getByText('Gastbezug (optional)'))
    fireEvent.change(screen.getByLabelText('Zweck (erforderlich)'), { target: { value: 'callback' } })
    fireEvent.input(screen.getByLabelText('Gastname'), { target: { value: 'Testgast Synthetisch' } })
    fireEvent.click(screen.getByText('Gastfall speichern'))
    await waitFor(() => expect(created).toEqual(['g1']))
    expect(fake.calls[0]!.args).toMatchObject({ p_purpose: 'callback', p_guest_name: 'Testgast Synthetisch' })
  })
})

describe('GuestCaseDrawer — display', () => {
  test('shows masked values, expiry, and reveals only on the audited action', async () => {
    const fake = fakeSupabase({
      tables: { guest_case_view: [MASKED] },
      rpc: { reveal_guest_case: () => ({ data: [{ guest_name: 'Testgast Synthetisch', contact_type: 'phone', contact_value: '+49 000 111' }] }) },
    })
    render(<GuestCaseDrawer api={createPilotApi(fake.client)} signature={SIG} caseId="g1" />)
    await waitFor(() => expect(screen.getByText('T. S.')).toBeTruthy())
    expect(screen.getByText('••• 11')).toBeTruthy()
    expect(screen.getByText(/Wird gelöscht am/)).toBeTruthy()
    expect(screen.queryByText('+49 000 111')).toBeNull()
    fireEvent.click(screen.getByText('Kontakt anzeigen (wird protokolliert)'))
    await waitFor(() => expect(screen.getByText('+49 000 111')).toBeTruthy())
  })
})
