import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { signal } from '@preact/signals'
import { PilotApp, type PilotDeps } from './PilotApp'
import { createPilotApi } from '../api/rpc'
import { fakeSupabase } from '../../test/fake-supabase'
import { fakeStorage } from '../../test/fake-storage'

export function fakeDeps(overrides: Partial<PilotDeps> = {}): PilotDeps {
  const fake = fakeSupabase()
  return {
    session: {
      user: signal<{ email: string } | null>(null), ready: signal(true),
      signIn: async () => ({ ok: true as const }), signOut: async () => {},
    },
    api: createPilotApi(fake.client),
    storage: fakeStorage(),
    now: () => new Date('2026-07-10T09:00:00Z'),
    ...overrides,
  }
}

describe('PilotApp', () => {
  test('signed out → shows Team-Anmeldung', () => {
    render(<PilotApp deps={fakeDeps()} />)
    expect(screen.getByText('Team-Anmeldung')).toBeTruthy()
  })
  test('signed in → shows board title and signature prompt', () => {
    const deps = fakeDeps({
      session: {
        user: signal({ email: 'pilot@example.test' }), ready: signal(true),
        signIn: async () => ({ ok: true }), signOut: async () => {},
      },
    })
    render(<PilotApp deps={deps} />)
    expect(screen.getByText('Übergaben')).toBeTruthy()
    expect(screen.getByText(/Kürzel wählen oder anlegen/)).toBeTruthy()
  })
})
