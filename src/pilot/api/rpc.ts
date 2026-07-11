import type { Department, Priority, Shift } from '../../domain/task'
import type { GuestPurpose, HandoverStatus, HandoverTuple, PilotTaskStatus } from '../domain/handover'
import type { PilotClient } from './client'
import { mapDbError, type PilotError } from './errors'

export type Result<T> = { ok: true; value: T } | { ok: false; error: PilotError }

export interface HandoverRow {
  id: string; organization_id: string; service_date: string
  source_shift: Shift; source_department: Department
  target_shift: Shift; target_department: Department
  status: HandoverStatus; version: number
  author_signature_id: string
  published_by_signature_id: string | null; published_at: string | null
  acknowledged_by_signature_id: string | null; acknowledged_at: string | null
}

export interface TaskRow {
  id: string; handover_id: string; text: string; room_reference: string
  department: Department; priority: Priority; status: PilotTaskStatus; version: number
  created_by_signature_id: string; completed_by_signature_id: string | null
  completed_at: string | null; carry_over_from_task_id: string | null
  guest_case_id: string | null; template: string | null; created_at: string
}

export interface SignatureRow {
  id: string; short_code: string; display_name: string; is_admin: boolean; active: boolean
}

export interface GuestCaseMasked {
  id: string; room_reference: string; purpose: GuestPurpose; purpose_note: string | null
  expires_at: string | null; deleted_at: string | null
  masked_name: string | null; masked_contact: string | null
  has_contact: boolean; has_name: boolean
}

type Raw = { data: unknown; error: { code?: string; message: string } | null }
const wrap = <T>(r: Raw): Result<T> =>
  r.error ? { ok: false, error: mapDbError(r.error) } : { ok: true, value: r.data as T }

export function createPilotApi(client: PilotClient) {
  return {
    async ensureSignature(shortCode: string, displayName: string): Promise<Result<SignatureRow>> {
      return wrap(await client.rpc('ensure_signature', { p_short_code: shortCode, p_display_name: displayName }))
    },
    async listSignatures(): Promise<Result<SignatureRow[]>> {
      return wrap(await client.from('staff_signatures').select('id, short_code, display_name, is_admin, active').order('short_code'))
    },
    async createOrGetDraft(t: HandoverTuple, signatureId: string): Promise<Result<HandoverRow>> {
      return wrap(await client.rpc('create_or_get_draft', {
        p_service_date: t.serviceDate, p_source_shift: t.sourceShift, p_source_department: t.sourceDepartment,
        p_target_shift: t.targetShift, p_target_department: t.targetDepartment, p_signature_id: signatureId,
      }))
    },
    async boardForDate(serviceDate: string): Promise<Result<HandoverRow[]>> {
      return wrap(await client.from('handovers').select('*').eq('service_date', serviceDate))
    },
    async handoverById(id: string): Promise<Result<HandoverRow>> {
      return wrap(await client.from('handovers').select('*').eq('id', id).single())
    },
    async tasksFor(handoverId: string): Promise<Result<TaskRow[]>> {
      return wrap(await client.from('handover_tasks').select('*').eq('handover_id', handoverId).order('created_at'))
    },
    async addTask(input: {
      handoverId: string; signatureId: string; text: string; roomReference?: string
      department?: Department; priority?: Priority; guestCaseId?: string | null; template?: string | null
    }): Promise<Result<TaskRow>> {
      return wrap(await client.rpc('add_task', {
        p_handover_id: input.handoverId, p_signature_id: input.signatureId, p_text: input.text,
        p_room_reference: input.roomReference ?? '', p_department: input.department ?? 'front-office',
        p_priority: input.priority ?? 'normal', p_guest_case_id: input.guestCaseId ?? null,
        p_template: input.template ?? null,
      }))
    },
    async updateTask(taskId: string, signatureId: string, expectedVersion: number, fields: {
      text: string; roomReference: string; department: Department; priority: Priority
    }): Promise<Result<TaskRow>> {
      return wrap(await client.rpc('update_task', {
        p_task_id: taskId, p_signature_id: signatureId, p_expected_version: expectedVersion,
        p_text: fields.text, p_room_reference: fields.roomReference,
        p_department: fields.department, p_priority: fields.priority,
      }))
    },
    async publishHandover(handoverId: string, signatureId: string, expectedVersion: number): Promise<Result<HandoverRow>> {
      return wrap(await client.rpc('publish_handover', {
        p_handover_id: handoverId, p_signature_id: signatureId, p_expected_version: expectedVersion,
      }))
    },
    async acknowledgeHandover(handoverId: string, signatureId: string): Promise<Result<HandoverRow>> {
      return wrap(await client.rpc('acknowledge_handover', { p_handover_id: handoverId, p_signature_id: signatureId }))
    },
    async amendHandover(handoverId: string, signatureId: string, reason: string, body: string): Promise<Result<unknown>> {
      return wrap(await client.rpc('amend_handover', {
        p_handover_id: handoverId, p_signature_id: signatureId, p_reason: reason, p_body: body,
      }))
    },
    async completeTask(taskId: string, signatureId: string, expectedVersion: number): Promise<Result<TaskRow>> {
      return wrap(await client.rpc('complete_task', {
        p_task_id: taskId, p_signature_id: signatureId, p_expected_version: expectedVersion,
      }))
    },
    async carryOverTask(taskId: string, signatureId: string, targetHandoverId: string): Promise<Result<TaskRow>> {
      return wrap(await client.rpc('carry_over_task', {
        p_task_id: taskId, p_signature_id: signatureId, p_target_handover_id: targetHandoverId,
      }))
    },
    async createGuestCase(input: {
      signatureId: string; purpose: GuestPurpose; purposeNote?: string; roomReference?: string
      guestName?: string; contactType?: 'phone' | 'email'; contactValue?: string
    }): Promise<Result<string>> {
      return wrap(await client.rpc('create_guest_case', {
        p_signature_id: input.signatureId, p_purpose: input.purpose,
        p_purpose_note: input.purposeNote ?? null, p_room_reference: input.roomReference ?? '',
        p_guest_name: input.guestName ?? null, p_contact_type: input.contactType ?? null,
        p_contact_value: input.contactValue ?? null,
      }))
    },
    async guestCase(caseId: string): Promise<Result<GuestCaseMasked>> {
      return wrap(await client.from('guest_case_view').select('*').eq('id', caseId).single())
    },
    async revealGuestCase(caseId: string, signatureId: string): Promise<Result<Array<{
      guest_name: string | null; contact_type: 'phone' | 'email' | null; contact_value: string | null
    }>>> {
      return wrap(await client.rpc('reveal_guest_case', { p_case_id: caseId, p_signature_id: signatureId }))
    },
    async adminDeleteGuestCase(caseId: string, signatureId: string): Promise<Result<null>> {
      return wrap(await client.rpc('admin_delete_guest_case', { p_case_id: caseId, p_signature_id: signatureId }))
    },
    async listAuditEvents(signatureId: string, limit = 100): Promise<Result<unknown[]>> {
      return wrap(await client.rpc('list_audit_events', { p_signature_id: signatureId, p_limit: limit }))
    },
    async retentionHealth(signatureId: string): Promise<Result<Array<{
      last_ran_at: string; last_ok: boolean; last_error: string | null; overdue_cases: number
    }>>> {
      return wrap(await client.rpc('retention_health', { p_signature_id: signatureId }))
    },
    async deactivateSignature(signatureId: string, targetId: string): Promise<Result<null>> {
      return wrap(await client.rpc('admin_deactivate_signature', { p_signature_id: signatureId, p_target_id: targetId }))
    },
    async pilotMetrics(signatureId: string, from: string, to: string): Promise<Result<Record<string, unknown>>> {
      return wrap(await client.rpc('pilot_metrics', { p_signature_id: signatureId, p_from: from, p_to: to }))
    },
    async searchArchive(filter: {
      from?: string; to?: string; status?: HandoverStatus
    }): Promise<Result<HandoverRow[]>> {
      let q = client.from('handovers').select('*').order('service_date', { ascending: false }).limit(200)
      if (filter.from) q = q.gte('service_date', filter.from)
      if (filter.to) q = q.lte('service_date', filter.to)
      if (filter.status) q = q.eq('status', filter.status)
      return wrap(await q)
    },
  }
}

export type PilotApi = ReturnType<typeof createPilotApi>
