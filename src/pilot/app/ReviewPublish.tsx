import type { HandoverRow, PilotApi, SignatureRow } from '../api/rpc'

interface TaskSummary { status: string; priority: string; carry_over_from_task_id: string | null }
export function ReviewPublish(_props: {
  api: PilotApi; signature: SignatureRow | null; handover: HandoverRow
  tasks: TaskSummary[]; onChanged(h: HandoverRow): void
}) {
  return null // Task 23 implements review + publish
}
