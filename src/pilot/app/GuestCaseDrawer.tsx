import type { PilotApi, SignatureRow } from '../api/rpc'

export function GuestCaseDrawer(_props: {
  api: PilotApi; signature: SignatureRow | null; caseId: string | null
  creatable?: boolean; onCreated?(id: string): void
}) {
  return null // Task 24 implements the purpose-gated drawer
}
