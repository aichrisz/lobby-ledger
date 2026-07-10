import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { App } from './App'

describe('App shell', () => {
  test('renders the wordmark', () => {
    render(<App />)
    expect(screen.getByText('Lobby Ledger')).toBeTruthy()
  })
})
