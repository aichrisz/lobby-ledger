# Lobby Ledger

> A mobile-first, local-first handover ledger for one hotel front desk.

Lobby Ledger helps a reception team capture operational tasks during Früh, Spät, or Nacht shift and turn them into a clear next-shift **Übergabe**.

## Privacy first

- No accounts, backend, analytics, sync, or third-party integrations.
- Data stays in this browser's `localStorage`.
- The UI explicitly asks staff not to enter guest names or contact details.
- Use room/task references and operational notes only.

## Features

- Quick task capture with department, reference, and priority
- Früh / Spät / Nacht context with automatic night theme
- Task completion, delete + undo, and local recovery safeguards
- Department-grouped handover brief
- Clipboard copy, `.txt` download, and A4-friendly print view
- Installable/offline-capable PWA after the initial online load

## Run locally

```bash
npm install
npm run dev
```

## Quality gates

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
npm audit --audit-level=moderate
```

## Scope

This MVP is intentionally a **single-device, single-front-desk tool**. It does not handle guest personal data, team sync, login, or hotel-system integrations.
