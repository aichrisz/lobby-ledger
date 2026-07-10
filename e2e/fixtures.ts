import type { Page } from '@playwright/test'
import type { Task } from '../src/domain/task'
import { STORAGE_KEY } from '../src/storage/store'

let n = 0
export function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date()
  return {
    id: `fixture-${n++}`, text: 'Wasserkocher defekt, Technik informiert', ref: '204',
    department: 'front-office', priority: 'normal', status: 'open',
    createdAt: now.toISOString(), createdShift: 'frueh', doneAt: null, ...overrides,
  }
}

export async function seed(page: Page, tasks: Task[]): Promise<void> {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key!, value!),
    [STORAGE_KEY, JSON.stringify({ schema: 1, tasks, shiftOverride: null })],
  )
}
