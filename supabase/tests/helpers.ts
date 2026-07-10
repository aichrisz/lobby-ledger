import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.API_URL ?? 'http://127.0.0.1:54321'
const anonKey = process.env.ANON_KEY
const serviceKey = process.env.SERVICE_ROLE_KEY
if (!anonKey || !serviceKey) {
  throw new Error('Run `npm run db:start` and export local keys: eval "$(supabase status -o env | sed \'s/^/export /\')"')
}

export const ORG_A = '00000000-0000-0000-0000-000000000001' // seeded
export const ORG_B = '00000000-0000-0000-0000-000000000002' // created below

/** Service-role client: local-only fixture arrangement. Never used in app code. */
export function admin(): SupabaseClient {
  return createClient(url, serviceKey!, { auth: { persistSession: false } })
}

export async function anonSignedIn(email = 'pilot@example.test', password = 'local-dev-only-password'): Promise<SupabaseClient> {
  const c = createClient(url, anonKey!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw error
  return c
}

/** Second org + its own shared user, to prove isolation. Idempotent. */
export async function ensureOrgB(): Promise<void> {
  const a = admin()
  await a.from('organizations').upsert({ id: ORG_B, name: 'Anderes Hotel (lokal)' })
  const { data: created, error } = await a.auth.admin.createUser({
    email: 'other@example.test', password: 'local-dev-only-password', email_confirm: true,
  })
  const userId = created?.user?.id
    ?? (await a.auth.admin.listUsers()).data.users.find((u) => u.email === 'other@example.test')?.id
  if (!userId && error) throw error
  await a.from('pilot_accounts').upsert({ user_id: userId!, organization_id: ORG_B })
  await a.from('staff_signatures').upsert(
    { organization_id: ORG_B, short_code: 'XY', display_name: 'Fremdes Kürzel' },
    { onConflict: 'organization_id,short_code' },
  )
}

export async function signatureId(c: SupabaseClient, shortCode: string): Promise<string> {
  const { data, error } = await c.from('staff_signatures').select('id').eq('short_code', shortCode).single()
  if (error) throw error
  return data.id
}
