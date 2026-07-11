import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { SignatureBar, loadStoredSignature, SIGNATURE_KEY } from './SignatureBar'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'
import { fakeStorage } from '../../test/fake-storage'

const SIG = { id: 's1', short_code: 'AB', display_name: 'Rezeption A', is_admin: false, active: true }

describe('SignatureBar', () => {
  test('creating a Kürzel calls ensure_signature and persists locally', async () => {
    const fake = fakeSupabase({ rpc: { ensure_signature: () => ({ data: SIG }) }, tables: { staff_signatures: [] } })
    const storage = fakeStorage()
    const onChange = vi_fn()
    render(<SignatureBar api={createPilotApi(fake.client)} storage={storage} value={null} onChange={onChange.fn} />)
    fireEvent.input(screen.getByLabelText('Kürzel'), { target: { value: 'ab' } })
    fireEvent.input(screen.getByLabelText('Anzeigename'), { target: { value: 'Rezeption A' } })
    fireEvent.click(screen.getByText('Übernehmen'))
    await waitFor(() => expect(onChange.calls[0]).toEqual(SIG))
    expect(JSON.parse(storage.getItem(SIGNATURE_KEY)!)).toMatchObject({ id: 's1', short_code: 'AB' })
  })
  test('loadStoredSignature rejects garbage', () => {
    const storage = fakeStorage({ [SIGNATURE_KEY]: '{broken' })
    expect(loadStoredSignature(storage)).toBeNull()
  })
})

function vi_fn() {
  const calls: unknown[] = []
  return { calls, fn: (v: unknown) => { calls.push(v) } }
}
