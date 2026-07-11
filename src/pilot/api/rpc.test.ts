import { describe, expect, test } from 'vitest'
import { createPilotApi } from './rpc'
import { fakeSupabase } from '../../test/fake-supabase'

const HANDOVER = {
  id: 'h1', organization_id: 'o1', service_date: '2026-07-10',
  source_shift: 'frueh', source_department: 'front-office',
  target_shift: 'spaet', target_department: 'front-office',
  status: 'draft', version: 1,
}

describe('createPilotApi', () => {
  test('createOrGetDraft passes the tuple and unwraps the row', async () => {
    const fake = fakeSupabase({ rpc: { create_or_get_draft: () => ({ data: HANDOVER }) } })
    const api = createPilotApi(fake.client)
    const res = await api.createOrGetDraft({
      serviceDate: '2026-07-10', sourceShift: 'frueh', sourceDepartment: 'front-office',
      targetShift: 'spaet', targetDepartment: 'front-office',
    }, 'sig-1')
    expect(res).toEqual({ ok: true, value: HANDOVER })
    expect(fake.calls[0]).toEqual({
      fn: 'create_or_get_draft',
      args: {
        p_service_date: '2026-07-10', p_source_shift: 'frueh', p_source_department: 'front-office',
        p_target_shift: 'spaet', p_target_department: 'front-office', p_signature_id: 'sig-1',
      },
    })
  })
  test('publish conflict surfaces as typed error', async () => {
    const fake = fakeSupabase({ rpc: { publish_handover: () => ({ error: { code: 'P0409', message: 'version conflict' } }) } })
    const api = createPilotApi(fake.client)
    const res = await api.publishHandover('h1', 'sig-1', 1)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('conflict')
  })
  test('boardForDate queries handovers by service_date', async () => {
    const fake = fakeSupabase({ tables: { handovers: [HANDOVER] } })
    const api = createPilotApi(fake.client)
    const res = await api.boardForDate('2026-07-10')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toEqual([HANDOVER])
  })
})
