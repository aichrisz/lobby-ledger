import { beforeAll, describe, expect, test } from 'vitest'
import { admin, anonSignedIn, ensureOrgB, ORG_A, ORG_B } from './helpers'

beforeAll(async () => {
  await ensureOrgB()
})

describe('RLS isolation', () => {
  test('unauthenticated requests read nothing', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const c = createClient(process.env.API_URL ?? 'http://127.0.0.1:54321', process.env.ANON_KEY!)
    const { data, error } = await c.from('staff_signatures').select('id')
    // 0001 revokes ALL privileges from anon: outright denial, not an empty result set
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  test('org A session sees only org A signatures', async () => {
    const c = await anonSignedIn()
    const { data, error } = await c.from('staff_signatures').select('organization_id')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((r) => r.organization_id === ORG_A)).toBe(true)
  })

  test('org B session cannot see org A rows', async () => {
    const c = await anonSignedIn('other@example.test')
    const { data } = await c.from('staff_signatures').select('organization_id')
    expect(data!.every((r) => r.organization_id === ORG_B)).toBe(true)
  })

  test('direct table writes are denied for the client role', async () => {
    const c = await anonSignedIn()
    const { error } = await c.from('staff_signatures')
      .insert({ organization_id: ORG_A, short_code: 'ZZ', display_name: 'Nope' })
    expect(error).not.toBeNull() // permission denied: writes go through RPCs only
  })

  test('guest case PII columns are unreadable directly', async () => {
    const c = await anonSignedIn()
    const { error } = await c.from('guest_cases').select('guest_name')
    expect(error).not.toBeNull() // column privilege denied
    const ok = await c.from('guest_cases').select('id, purpose, expires_at')
    expect(ok.error).toBeNull()
  })

  test('audit_events are not directly readable', async () => {
    const c = await anonSignedIn()
    const { error } = await c.from('audit_events').select('id')
    expect(error).not.toBeNull()
  })
})
