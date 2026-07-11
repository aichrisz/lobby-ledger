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
      <section class="signin-sheet" aria-labelledby="signin-title">
        <header class="signin-intro">
          <p class="eyebrow">Lobby Ledger · Übergabe</p>
          <h1 id="signin-title">Team-Anmeldung</h1>
          <p class="signin-lede">Für die nächste Schicht: ein klarer Überblick, sauber übergeben.</p>
        </header>
        <form onSubmit={submit} class="signin-form">
          <label><span>E-Mail</span><input name="email" type="email" autocomplete="username" required /></label>
          <label><span>Passwort</span><input name="password" type="password" autocomplete="current-password" required /></label>
          <button type="submit" disabled={pending}>{pending ? 'Anmeldung läuft …' : 'Schicht öffnen'}</button>
          {error && <p class="hint" role="status">{error}</p>}
        </form>
        <footer class="signin-footer">Gemeinsamer Zugang · persönliche Kürzel je Übergabe</footer>
      </section>
    </main>
  )
}
