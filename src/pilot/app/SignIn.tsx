import { useState } from 'preact/hooks'
import type { PilotSession } from '../api/session'

export function SignIn({ session }: { session: PilotSession }) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const submit = async (e: Event) => {
    e.preventDefault()
    const form = e.currentTarget as HTMLFormElement
    const data = new FormData(form)
    setPending(true)
    const res = await session.signIn(String(data.get('email')), String(data.get('password')))
    setPending(false)
    if (!res.ok) setError(res.message)
  }
  return (
    <main class="signin">
      <h1>Team-Anmeldung</h1>
      <form onSubmit={submit}>
        <label>E-Mail<input name="email" type="email" autocomplete="username" required /></label>
        <label>Passwort<input name="password" type="password" autocomplete="current-password" required /></label>
        <button type="submit" disabled={pending}>{pending ? '…' : 'Anmelden'}</button>
        {error && <p class="hint" role="status">{error}</p>}
      </form>
    </main>
  )
}
