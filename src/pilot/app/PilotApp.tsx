import { useEffect, useState } from 'preact/hooks'
import type { StorageLike } from '../../storage/store'
import type { PilotSession } from '../api/session'
import type { PilotApi, SignatureRow } from '../api/rpc'
import { SignIn } from './SignIn'
import { SignatureBar, loadStoredSignature } from './SignatureBar'
import { ShiftBoard } from './ShiftBoard'

export interface PilotDeps {
  session: PilotSession
  api: PilotApi
  storage: StorageLike
  now(): Date
}

export type PilotRoute =
  | { view: 'board' } | { view: 'handover'; id: string }
  | { view: 'inbox' } | { view: 'archive' } | { view: 'admin' }

export function parsePilotRoute(hash: string): PilotRoute {
  const m = hash.match(/^#\/handover\/([\w-]+)$/)
  if (m) return { view: 'handover', id: m[1]! }
  if (hash === '#/inbox') return { view: 'inbox' }
  if (hash === '#/archive') return { view: 'archive' }
  if (hash === '#/admin') return { view: 'admin' }
  return { view: 'board' }
}

export function PilotApp({ deps }: { deps: PilotDeps }) {
  const [route, setRoute] = useState<PilotRoute>(parsePilotRoute(location.hash))
  const [signature, setSignature] = useState<SignatureRow | null>(loadStoredSignature(deps.storage))
  useEffect(() => {
    const onHash = () => setRoute(parsePilotRoute(location.hash))
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  if (!deps.session.ready.value) return <main />
  if (!deps.session.user.value) return <SignIn session={deps.session} />

  return (
    <div class="app pilot">
      <header class="header">
        <span class="wordmark">Lobby Ledger · Team</span>
        <nav aria-label="Bereiche">
          <a href="#/">Übersicht</a> <a href="#/inbox">Eingang</a> <a href="#/archive">Archiv</a> <a href="#/admin">Verwaltung</a>
        </nav>
      </header>
      <SignatureBar api={deps.api} storage={deps.storage} value={signature} onChange={setSignature} />
      <main>
        {/* Tasks 22–25 mount HandoverEditor / Inbox / Archive / AdminPanel here */}
        {route.view === 'board' && <ShiftBoard api={deps.api} signature={signature} now={deps.now} />}
      </main>
    </div>
  )
}
