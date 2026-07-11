import { beforeAll, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, anonSignedIn, signatureId } from './helpers'

let c: SupabaseClient
let sigAB: string
let day = 0
const date = () => `2032-03-${String(++day).padStart(2, '0')}`

async function caseWithCompletedTask() {
  const gcId = (await c.rpc('create_guest_case', {
    p_signature_id: sigAB, p_purpose: 'callback', p_room_reference: '117',
    p_guest_name: 'Testgast Synthetisch', p_contact_type: 'phone', p_contact_value: '+49 000 111',
  })).data as string
  const h = (await c.rpc('create_or_get_draft', {
    p_service_date: date(), p_source_shift: 'spaet', p_source_department: 'front-office',
    p_target_shift: 'nacht', p_target_department: 'front-office', p_signature_id: sigAB,
  })).data
  const t = (await c.rpc('add_task', {
    p_handover_id: h.id, p_signature_id: sigAB, p_text: 'Rückruf erledigen — Details im Gastfall',
    p_guest_case_id: gcId,
  })).data
  const done = (await c.rpc('complete_task', {
    p_task_id: t.id, p_signature_id: sigAB, p_expected_version: t.version,
  })).data
  return { gcId, task: done }
}

beforeAll(async () => {
  c = await anonSignedIn()
  sigAB = await signatureId(c, 'AB')
})

describe('purpose gate', () => {
  test('other without note → P0422', async () => {
    const { error } = await c.rpc('create_guest_case', {
      p_signature_id: sigAB, p_purpose: 'other', p_guest_name: 'Testgast Synthetisch',
    })
    expect(error?.code).toBe('P0422')
  })
})

describe('masking and reveal', () => {
  test('view returns masked values; reveal returns full values and audits', async () => {
    const { gcId } = await caseWithCompletedTask()
    const masked = await c.from('guest_case_view').select('*').eq('id', gcId).single()
    expect(masked.data!.masked_name).toBe('T. S.')
    expect(masked.data!.masked_contact).toBe('••• 11')
    expect(masked.data!.has_contact).toBe(true)

    const revealed = await c.rpc('reveal_guest_case', { p_case_id: gcId, p_signature_id: sigAB })
    expect(revealed.data![0].guest_name).toBe('Testgast Synthetisch')

    const a = admin()
    const audit = await a.from('audit_events').select('action, metadata')
      .eq('entity_id', gcId).eq('action', 'guest_case.revealed')
    expect(audit.error).toBeNull()
    expect(audit.data!.length).toBeGreaterThan(0)
  })
})

describe('retention', () => {
  test('completing the last linked task arms expires_at ≈ +30 days', async () => {
    const { gcId, task } = await caseWithCompletedTask()
    const a = admin()
    const result = await a.from('guest_cases').select('expires_at').eq('id', gcId).single()
    expect(result.error).toBeNull()
    const gc = result.data!
    const delta = Date.parse(gc.expires_at) - Date.parse(task.completed_at)
    expect(Math.round(delta / 86_400_000)).toBe(30)
  })

  test('retention run masks expired cases and audits guest_case.expired', async () => {
    const { gcId } = await caseWithCompletedTask()
    const a = admin()
    const expired = await a.from('guest_cases').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', gcId)
    expect(expired.error).toBeNull()
    const { data: deleted, error } = await a.rpc('run_guest_case_retention')
    expect(error).toBeNull()
    expect(deleted).toBeGreaterThanOrEqual(1)
    const gc = (await a.from('guest_cases').select('*').eq('id', gcId).single()).data!
    expect(gc.guest_name).toBeNull()
    expect(gc.contact_value).toBeNull()
    expect(gc.deleted_at).not.toBeNull()
    const runs = await a.from('retention_runs').select('ok').order('ran_at', { ascending: false }).limit(1)
    expect(runs.data?.[0]?.ok).toBe(true)
    const audit = await a.from('audit_events').select('id').eq('entity_id', gcId).eq('action', 'guest_case.expired')
    expect(audit.data!.length).toBe(1)
  })

  test('client role cannot call the retention function', async () => {
    const { error } = await c.rpc('run_guest_case_retention')
    expect(error).not.toBeNull()
  })
})

describe('audit hygiene', () => {
  test('no audit row ever contains guest values or task text', async () => {
    await caseWithCompletedTask()
    const a = admin()
    const result = await a.from('audit_events').select('metadata')
    expect(result.error).toBeNull()
    const rows = result.data!
    for (const row of rows) {
      const s = JSON.stringify(row.metadata)
      expect(s).not.toContain('Testgast')
      expect(s).not.toContain('+49')
      expect(s).not.toContain('Rückruf erledigen')
    }
  })
  test('non-admin cannot list audit events; admin signature can', async () => {
    const sigLK = await signatureId(c, 'LK')
    const denied = await c.rpc('list_audit_events', { p_signature_id: sigLK })
    expect(denied.error?.code).toBe('P0403')
    const allowed = await c.rpc('list_audit_events', { p_signature_id: sigAB }) // AB seeded is_admin
    expect(allowed.error).toBeNull()
    expect(allowed.data!.length).toBeGreaterThan(0)
  })
})
