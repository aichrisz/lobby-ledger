import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { HandoverEditor } from './HandoverEditor'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const SIG = { id: 's1', short_code: 'AB', display_name: 'A', is_admin: false, active: true }
const H = {
  id: 'h1', service_date: '2026-07-10', source_shift: 'frueh', source_department: 'front-office',
  target_shift: 'spaet', target_department: 'front-office', status: 'draft', version: 1,
}
const TASK = {
  id: 't1', handover_id: 'h1', text: 'Wasserkocher defekt', room_reference: '204',
  department: 'front-office', priority: 'wichtig', status: 'open', version: 1,
  created_by_signature_id: 's1', completed_by_signature_id: null, completed_at: null,
  carry_over_from_task_id: null, guest_case_id: null, template: 'technik', created_at: '2026-07-10T07:00:00Z',
}

function setup(tables = {}, rpc = {}) {
  const fake = fakeSupabase({
    tables: { handovers: [H], handover_tasks: [TASK], staff_signatures: [SIG], ...tables },
    rpc: { add_task: (a) => ({ data: { ...TASK, id: 't2', text: a.p_text } }), ...rpc },
  })
  render(<HandoverEditor api={createPilotApi(fake.client)} signature={SIG} handoverId="h1" />)
  return fake
}

describe('HandoverEditor', () => {
  test('shows routing context and existing tasks with priority', async () => {
    setup()
    await waitFor(() => expect(screen.getByText(/Früh Front Office → Spät Front Office/)).toBeTruthy())
    expect(screen.getByText('Wasserkocher defekt')).toBeTruthy()
    expect(screen.getByText('Wichtig')).toBeTruthy()
  })
  test('contact data in capture text blocks the save with the guest-case hint', async () => {
    const fake = setup()
    await waitFor(() => screen.getByPlaceholderText('Neue Aufgabe … (keine Gastnamen)'))
    fireEvent.input(screen.getByPlaceholderText('Neue Aufgabe … (keine Gastnamen)'),
      { target: { value: 'Rückruf +49 171 2345678' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Aufgabe erfassen' }))
    expect(screen.getByText('Kontaktdaten bitte nicht im Text – Gastfall mit Zweck verwenden.')).toBeTruthy()
    expect(fake.calls.filter((c) => c.fn === 'add_task')).toHaveLength(0)
  })
  test('template chip prefills text and tags the task', async () => {
    const fake = setup()
    await waitFor(() => screen.getByText('Technik'))
    fireEvent.click(screen.getByText('Technik'))
    const input = screen.getByPlaceholderText('Neue Aufgabe … (keine Gastnamen)') as HTMLInputElement
    expect(input.value).toBe('Technik: ')
    fireEvent.input(input, { target: { value: 'Technik: Wasserkocher 204' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Aufgabe erfassen' }))
    await waitFor(() => {
      const call = fake.calls.find((c) => c.fn === 'add_task')!
      expect((call.args as Record<string, unknown>).p_template).toBe('technik')
    })
  })
  test('carried-over task shows its origin label', async () => {
    setup({
      handover_tasks: [{ ...TASK, carry_over_from_task_id: 't0', text: 'Anreise ca. 23 Uhr' }],
    })
    await waitFor(() => expect(screen.getByText(/übertragen aus/)).toBeTruthy())
  })
})
