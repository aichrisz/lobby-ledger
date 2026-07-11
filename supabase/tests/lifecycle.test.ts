import { beforeAll, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonSignedIn, signatureId } from './helpers'

let c: SupabaseClient
let sigAB: string
let sigLK: string
let day = 0
const date = () => `2031-01-${String(++day).padStart(2, '0')}` // far-future test dates, one per test

async function draft(client: SupabaseClient, sig: string, serviceDate: string) {
  const { data, error } = await client.rpc('create_or_get_draft', {
    p_service_date: serviceDate, p_source_shift: 'frueh', p_source_department: 'front-office',
    p_target_shift: 'spaet', p_target_department: 'front-office', p_signature_id: sig,
  })
  if (error) throw error
  return data
}

beforeAll(async () => {
  c = await anonSignedIn()
  sigAB = await signatureId(c, 'AB')
  sigLK = await signatureId(c, 'LK')
})

describe('draft creation', () => {
  test('is idempotent per tuple', async () => {
    const d = date()
    const a = await draft(c, sigAB, d)
    const b = await draft(c, sigLK, d)
    expect(b.id).toBe(a.id)
    expect(a.status).toBe('draft')
  })
  test('rejects identical source and target', async () => {
    const { error } = await c.rpc('create_or_get_draft', {
      p_service_date: date(), p_source_shift: 'frueh', p_source_department: 'front-office',
      p_target_shift: 'frueh', p_target_department: 'front-office', p_signature_id: sigAB,
    })
    expect(error?.code).toBe('P0422')
  })
})

describe('publish → acknowledge', () => {
  test('happy path stamps signatures and bumps versions', async () => {
    const h = await draft(c, sigAB, date())
    const pub = await c.rpc('publish_handover', {
      p_handover_id: h.id, p_signature_id: sigAB, p_expected_version: h.version,
    })
    expect(pub.error).toBeNull()
    expect(pub.data.status).toBe('published')
    expect(pub.data.published_by_signature_id).toBe(sigAB)
    const ack = await c.rpc('acknowledge_handover', { p_handover_id: h.id, p_signature_id: sigLK })
    expect(ack.data.status).toBe('acknowledged')
    expect(ack.data.acknowledged_by_signature_id).toBe(sigLK)
  })
  test('stale version → P0409', async () => {
    const h = await draft(c, sigAB, date())
    const { error } = await c.rpc('publish_handover', {
      p_handover_id: h.id, p_signature_id: sigAB, p_expected_version: h.version + 5,
    })
    expect(error?.code).toBe('P0409')
  })
  test('acknowledging a draft → P0422; double acknowledge → P0422', async () => {
    const h = await draft(c, sigAB, date())
    const first = await c.rpc('acknowledge_handover', { p_handover_id: h.id, p_signature_id: sigLK })
    expect(first.error?.code).toBe('P0422')
    await c.rpc('publish_handover', { p_handover_id: h.id, p_signature_id: sigAB, p_expected_version: h.version })
    await c.rpc('acknowledge_handover', { p_handover_id: h.id, p_signature_id: sigLK })
    const again = await c.rpc('acknowledge_handover', { p_handover_id: h.id, p_signature_id: sigAB })
    expect(again.error?.code).toBe('P0422')
  })
})

describe('tasks', () => {
  test('contact data in free text is rejected by the DB', async () => {
    const h = await draft(c, sigAB, date())
    const { error } = await c.rpc('add_task', {
      p_handover_id: h.id, p_signature_id: sigAB, p_text: 'Rückruf +49 171 2345678',
    })
    expect(error).not.toBeNull() // 23514 check_violation
  })
  test('editing after publish → P0422; amendment works instead', async () => {
    const h = await draft(c, sigAB, date())
    const t = (await c.rpc('add_task', {
      p_handover_id: h.id, p_signature_id: sigAB, p_text: 'Zimmer 204 prüfen',
    })).data
    await c.rpc('publish_handover', { p_handover_id: h.id, p_signature_id: sigAB, p_expected_version: h.version })
    const upd = await c.rpc('update_task', {
      p_task_id: t.id, p_signature_id: sigAB, p_expected_version: t.version,
      p_text: 'Geändert', p_room_reference: '', p_department: 'front-office', p_priority: 'normal',
    })
    expect(upd.error?.code).toBe('P0422')
    const amend = await c.rpc('amend_handover', {
      p_handover_id: h.id, p_signature_id: sigAB,
      p_reason: 'Korrektur', p_body: 'Zimmer 204: Technik war schon informiert.',
    })
    expect(amend.error).toBeNull()
  })
  test('carry-over: published source → new draft task with provenance, source becomes carried', async () => {
    const d1 = date(); const d2 = date()
    const h1 = await draft(c, sigAB, d1)
    const t = (await c.rpc('add_task', {
      p_handover_id: h1.id, p_signature_id: sigAB, p_text: 'Wasserkocher defekt', p_room_reference: '204',
    })).data
    await c.rpc('publish_handover', { p_handover_id: h1.id, p_signature_id: sigAB, p_expected_version: h1.version })
    const h2 = await draft(c, sigLK, d2)
    const carried = await c.rpc('carry_over_task', {
      p_task_id: t.id, p_signature_id: sigLK, p_target_handover_id: h2.id,
    })
    expect(carried.error).toBeNull()
    expect(carried.data.carry_over_from_task_id).toBe(t.id)
    expect(carried.data.status).toBe('open')
    const src = await c.from('handover_tasks').select('status').eq('id', t.id).single()
    expect(src.data!.status).toBe('carried')
  })
  test('carry-over from a draft → P0422', async () => {
    const h1 = await draft(c, sigAB, date())
    const t = (await c.rpc('add_task', {
      p_handover_id: h1.id, p_signature_id: sigAB, p_text: 'Noch im Entwurf',
    })).data
    const h2 = await draft(c, sigAB, date())
    const { error } = await c.rpc('carry_over_task', {
      p_task_id: t.id, p_signature_id: sigAB, p_target_handover_id: h2.id,
    })
    expect(error?.code).toBe('P0422')
  })
})

describe('signatures', () => {
  test('ensure_signature normalizes and is idempotent', async () => {
    const a = await c.rpc('ensure_signature', { p_short_code: ' mn ', p_display_name: 'Nachtdienst M' })
    const b = await c.rpc('ensure_signature', { p_short_code: 'MN', p_display_name: 'anders' })
    expect(a.error).toBeNull()
    expect(b.data.id).toBe(a.data.id)
    expect(a.data.short_code).toBe('MN')
  })
  test('invalid Kürzel → P0422', async () => {
    const { error } = await c.rpc('ensure_signature', { p_short_code: 'M1', p_display_name: 'X' })
    expect(error?.code).toBe('P0422')
  })
})
