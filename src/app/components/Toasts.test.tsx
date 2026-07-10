import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { updateReady } from '../sw-register'
import { UpdateBar } from './Toasts'

describe('UpdateBar', () => {
  test('hidden by default, shows and applies when an update is ready', () => {
    updateReady.value = null
    const { rerender } = render(<UpdateBar />)
    expect(screen.queryByText('Neue Version verfügbar.')).toBeNull()
    const apply = vi.fn()
    updateReady.value = apply
    rerender(<UpdateBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }))
    expect(apply).toHaveBeenCalledOnce()
    updateReady.value = null
  })
})
