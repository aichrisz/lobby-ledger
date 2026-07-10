import { signal } from '@preact/signals'

export const updateReady = signal<(() => void) | null>(null)

export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return
  let applyingUpdate = false
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      reg.addEventListener('updatefound', () => {
        const next = reg.installing
        next?.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            updateReady.value = () => {
              applyingUpdate = true
              next.postMessage('SKIP_WAITING')
            }
          }
        })
      })
    })
    .catch(() => {
      // app fully works without a service worker
    })
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applyingUpdate) location.reload()
  })
}
