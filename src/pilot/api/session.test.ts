import { describe, expect, test } from 'vitest'
import { createSession } from './session'
import { fakeSupabase } from '../../test/fake-supabase'

describe('createSession', () => {
  test('starts signed out, signs in, signs out', async () => {
    const fake = fakeSupabase()
    const s = createSession(fake.client)
    expect(s.user.value).toBeNull()
    const ok = await s.signIn('pilot@example.test', 'pw')
    expect(ok).toEqual({ ok: true })
    expect(s.user.value?.email).toBe('pilot@example.test')
    await s.signOut()
    expect(s.user.value).toBeNull()
  })
  test('bad credentials → typed error, stays signed out', async () => {
    const fake = fakeSupabase({ failAuth: true })
    const s = createSession(fake.client)
    const res = await s.signIn('pilot@example.test', 'wrong')
    expect(res.ok).toBe(false)
    expect(s.user.value).toBeNull()
  })
})
