import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    fileParallelism: false, // shared database state; run files sequentially
    testTimeout: 20_000,
  },
})
