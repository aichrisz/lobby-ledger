import { describe, expect, test } from 'vitest'
import { createTask, parseTask, TEXT_MAX, REF_MAX, type Task } from './task'

const NOW = new Date('2026-07-10T09:12:00.000Z')

describe('createTask', () => {
  test('creates an open front-office normal task by default', () => {
    const t = createTask({ text: '  Wasserkocher defekt  ' }, NOW, 'frueh')
    expect(t).not.toBeNull()
    expect(t!.text).toBe('Wasserkocher defekt')
    expect(t!.ref).toBe('')
    expect(t!.department).toBe('front-office')
    expect(t!.priority).toBe('normal')
    expect(t!.status).toBe('open')
    expect(t!.createdAt).toBe(NOW.toISOString())
    expect(t!.createdShift).toBe('frueh')
    expect(t!.doneAt).toBeNull()
    expect(t!.id.length).toBeGreaterThan(0)
  })
  test('honors explicit fields and trims ref', () => {
    const t = createTask({ text: 'Extra Kissen', ref: ' 310 ', department: 'housekeeping', priority: 'wichtig' }, NOW, 'spaet')
    expect(t!.ref).toBe('310')
    expect(t!.department).toBe('housekeeping')
    expect(t!.priority).toBe('wichtig')
  })
  test('rejects empty or whitespace-only text', () => {
    expect(createTask({ text: '   ' }, NOW, 'frueh')).toBeNull()
  })
  test('rejects overlong text and ref', () => {
    expect(createTask({ text: 'x'.repeat(TEXT_MAX + 1) }, NOW, 'frueh')).toBeNull()
    expect(createTask({ text: 'ok', ref: '9'.repeat(REF_MAX + 1) }, NOW, 'frueh')).toBeNull()
  })
})

describe('parseTask', () => {
  const valid: Task = {
    id: 'a1', text: 'Taxi 06:30 bestellt', ref: '118', department: 'front-office',
    priority: 'normal', status: 'done', createdAt: '2026-07-10T05:00:00.000Z',
    createdShift: 'nacht', doneAt: '2026-07-10T05:30:00.000Z',
  }
  test('round-trips a valid task', () => {
    expect(parseTask(JSON.parse(JSON.stringify(valid)))).toEqual(valid)
  })
  test.each([
    ['non-object', 'nope'],
    ['missing id', { ...valid, id: undefined }],
    ['empty text', { ...valid, text: '  ' }],
    ['bad department', { ...valid, department: 'spa' }],
    ['bad priority', { ...valid, priority: 'urgent' }],
    ['bad status', { ...valid, status: 'blocked' }],
    ['bad createdAt', { ...valid, createdAt: 'yesterday' }],
    ['bad createdShift', { ...valid, createdShift: 'day' }],
    ['bad doneAt', { ...valid, doneAt: 42 }],
    ['overlong ref', { ...valid, ref: 'r'.repeat(REF_MAX + 1) }],
  ])('rejects %s', (_name, raw) => {
    expect(parseTask(raw)).toBeNull()
  })
  test('drops unknown extra properties', () => {
    const parsed = parseTask({ ...valid, guestName: 'NOPE' })
    expect(parsed).toEqual(valid)
    expect('guestName' in parsed!).toBe(false)
  })
})
