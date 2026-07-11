import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateTaskInput, LedgerDepartment, LedgerPriority, LedgerShift, TaskPatchInput,
} from './validation.js'

function route(shift: LedgerShift) {
  const targetShift = shift === 'frueh' ? 'spaet' : shift === 'spaet' ? 'nacht' : 'frueh'
  return {
    source_shift: shift,
    source_department: 'front-office',
    target_shift: targetShift,
    target_department: 'front-office',
  } as const
}

export interface LedgerTask {
  id: string
  text: string
  ref: string
  department: LedgerDepartment
  priority: LedgerPriority
  status: 'open' | 'done'
  createdAt: string
  createdShift: LedgerShift
  doneAt: string | null
}

function database(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Database configuration missing')
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function task(row: Record<string, unknown>, shift: LedgerShift): LedgerTask {
  return {
    id: String(row.id), text: String(row.text),
    ref: typeof row.room_reference === 'string' ? row.room_reference : '',
    department: row.department === 'housekeeping' || row.department === 'restaurant' ? row.department : 'front-office',
    priority: row.priority === 'wichtig' ? 'wichtig' : 'normal',
    status: row.status === 'done' ? 'done' : 'open', createdAt: String(row.created_at),
    createdShift: shift, doneAt: typeof row.completed_at === 'string' ? row.completed_at : null,
  }
}

async function handoverId(client: SupabaseClient, organizationId: string, date: string, shift: LedgerShift): Promise<string | null> {
  const taskSet = route(shift)
  const { data, error } = await client.from('handovers').select('id')
    .eq('organization_id', organizationId).eq('service_date', date)
    .eq('source_shift', taskSet.source_shift).eq('source_department', taskSet.source_department)
    .eq('target_shift', taskSet.target_shift).eq('target_department', taskSet.target_department)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

async function ensureSignature(client: SupabaseClient, organizationId: string, initials: string): Promise<string> {
  const existing = await client.from('staff_signatures').select('id')
    .eq('organization_id', organizationId).eq('short_code', initials).eq('active', true).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.id) return existing.data.id
  const inserted = await client.from('staff_signatures').insert({
    organization_id: organizationId, short_code: initials, display_name: initials,
  }).select('id').single()
  if (!inserted.error && inserted.data?.id) return inserted.data.id
  const raced = await client.from('staff_signatures').select('id')
    .eq('organization_id', organizationId).eq('short_code', initials).eq('active', true).single()
  if (raced.error || !raced.data?.id) throw inserted.error ?? raced.error ?? new Error('Signature creation failed')
  return raced.data.id
}

async function ensureHandover(
  client: SupabaseClient, organizationId: string, date: string, shift: LedgerShift, signatureId: string,
): Promise<string> {
  const existing = await handoverId(client, organizationId, date, shift)
  if (existing) return existing
  const inserted = await client.from('handovers').insert({
    organization_id: organizationId, service_date: date, ...route(shift), author_signature_id: signatureId,
  }).select('id').single()
  if (!inserted.error && inserted.data?.id) return inserted.data.id
  const raced = await handoverId(client, organizationId, date, shift)
  if (!raced) throw inserted.error ?? new Error('Handover creation failed')
  return raced
}

export async function listTasks(organizationId: string, date: string, shift: LedgerShift): Promise<LedgerTask[]> {
  const client = database()
  const id = await handoverId(client, organizationId, date, shift)
  if (!id) return []
  const { data, error } = await client.from('handover_tasks')
    .select('id, text, room_reference, department, priority, status, created_at, completed_at')
    .eq('organization_id', organizationId).eq('handover_id', id).is('guest_case_id', null)
    .in('status', ['open', 'done']).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => task(row, shift))
}

export async function createTask(organizationId: string, input: CreateTaskInput): Promise<LedgerTask> {
  const client = database()
  const signatureId = await ensureSignature(client, organizationId, input.initials)
  const id = await ensureHandover(client, organizationId, input.date, input.shift, signatureId)
  const { data, error } = await client.from('handover_tasks').insert({
    organization_id: organizationId, handover_id: id, text: input.text,
    room_reference: input.ref || null, department: input.department, priority: input.priority, status: 'open',
    created_by_signature_id: signatureId,
  }).select('id, text, room_reference, department, priority, status, created_at, completed_at').single()
  if (error || !data) throw error ?? new Error('Task creation failed')
  return task(data, input.shift)
}

export async function updateTaskStatus(
  organizationId: string, taskId: string, input: TaskPatchInput,
): Promise<LedgerTask> {
  const client = database()
  const signatureId = await ensureSignature(client, organizationId, input.initials)
  const id = await handoverId(client, organizationId, input.date, input.shift)
  if (!id) throw new Error('Aufgabe nicht gefunden')
  const completed = input.status === 'done'
  const { data, error } = await client.from('handover_tasks').update({
    status: input.status, completed_by_signature_id: completed ? signatureId : null,
    completed_at: completed ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  }).eq('id', taskId).eq('organization_id', organizationId).eq('handover_id', id)
    .is('guest_case_id', null).in('status', ['open', 'done'])
    .select('id, text, room_reference, department, priority, status, created_at, completed_at').single()
  if (error || !data) throw error ?? new Error('Aufgabe nicht gefunden')
  return task(data, input.shift)
}

export async function deleteTask(
  organizationId: string, taskId: string, input: { date: string; shift: LedgerShift; initials: string },
): Promise<void> {
  const client = database()
  await ensureSignature(client, organizationId, input.initials)
  const id = await handoverId(client, organizationId, input.date, input.shift)
  if (!id) throw new Error('Aufgabe nicht gefunden')
  const { error } = await client.from('handover_tasks').delete()
    .eq('id', taskId).eq('organization_id', organizationId).eq('handover_id', id)
    .is('guest_case_id', null).in('status', ['open', 'done'])
  if (error) throw error
}
