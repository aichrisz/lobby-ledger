import { signal, type Signal } from '@preact/signals'
import type { PilotClient } from './client'

export interface SessionUser { email: string }
export interface PilotSession {
  user: Signal<SessionUser | null>
  ready: Signal<boolean>
  signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }>
  signOut(): Promise<void>
}

export function createSession(client: PilotClient): PilotSession {
  const user = signal<SessionUser | null>(null)
  const ready = signal(false)
  void client.auth.getSession().then(({ data }) => {
    user.value = data.session?.user?.email ? { email: data.session.user.email } : null
    ready.value = true
  })
  client.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user?.email ? { email: session.user.email } : null
  })
  return {
    user, ready,
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      if (error || !data.user?.email) return { ok: false, message: 'Anmeldung fehlgeschlagen. Zugangsdaten prüfen.' }
      user.value = { email: data.user.email }
      return { ok: true }
    },
    async signOut() {
      await client.auth.signOut()
      user.value = null
    },
  }
}
