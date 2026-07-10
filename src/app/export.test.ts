import { describe, expect, test, vi } from 'vitest'
import { copyText, downloadText } from './export'

const stubClipboard = (impl: (t: string) => Promise<void>) =>
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: impl }, configurable: true,
  })

describe('copyText', () => {
  test('resolves true when the clipboard accepts', async () => {
    stubClipboard(() => Promise.resolve())
    expect(await copyText('ÜBERGABE …')).toBe(true)
  })
  test('resolves false when the clipboard rejects (denied/insecure)', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')))
    expect(await copyText('x')).toBe(false)
  })
})

describe('downloadText', () => {
  test('creates and clicks a temporary object-URL anchor', () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadText('uebergabe-2026-07-10-frueh.txt', 'inhalt')
    expect(createUrl).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeUrl).toHaveBeenCalledWith('blob:x')
    createUrl.mockRestore(); revokeUrl.mockRestore(); click.mockRestore()
  })
})
