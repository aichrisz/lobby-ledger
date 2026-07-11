import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type PilotClient = SupabaseClient

export function createPilotClient(
  url: string = import.meta.env.VITE_SUPABASE_URL as string,
  anonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY as string,
): PilotClient {
  if (!url || !anonKey) throw new Error('Pilot config missing — see .env.example')
  return createClient(url, anonKey)
}
