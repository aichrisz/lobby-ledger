import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { PilotApp } from './PilotApp'

describe('PilotApp shell', () => {
  test('renders the pilot wordmark', () => {
    render(<PilotApp />)
    expect(screen.getByText('Lobby Ledger · Team')).toBeTruthy()
  })
})
