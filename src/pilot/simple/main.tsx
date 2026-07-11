import { render } from 'preact'
import '@fontsource-variable/fraunces/index.css'
import '../../styles/tokens.css'
import '../../styles/base.css'
import './simple.css'
import { createLedgerApi } from './api'
import { SimplePilotApp } from './SimplePilotApp'

async function removeLegacyOfflineData(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }
  if ('caches' in globalThis) {
    const names = await caches.keys()
    await Promise.all(names.filter((name) => name.startsWith('lobby-ledger-')).map((name) => caches.delete(name)))
  }
}

function download(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

void removeLegacyOfflineData().finally(() => {
  render(<SimplePilotApp deps={{
    api: createLedgerApi(), storage: localStorage, now: () => new Date(),
    print: () => window.print(), copy: (text) => navigator.clipboard.writeText(text), download,
  }} />, document.getElementById('app')!)
})
