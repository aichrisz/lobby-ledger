export interface FakeSupabaseOptions {
  failAuth?: boolean
  rpc?: Record<string, (args: Record<string, unknown>) => { data?: unknown; error?: { code?: string; message: string } | null }>
  tables?: Record<string, unknown[]>
}

export function fakeSupabase(opts: FakeSupabaseOptions = {}) {
  let currentUser: { email: string } | null = null
  const calls: Array<{ fn: string; args: unknown }> = []
  const client = {
    auth: {
      async signInWithPassword({ email }: { email: string; password: string }) {
        if (opts.failAuth) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } }
        currentUser = { email }
        return { data: { user: currentUser, session: {} }, error: null }
      },
      async signOut() { currentUser = null; return { error: null } },
      async getSession() {
        return { data: { session: currentUser ? { user: currentUser } : null }, error: null }
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } }
      },
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args })
      const impl = opts.rpc?.[fn]
      if (!impl) return { data: null, error: { message: `no fake for rpc ${fn}` } }
      const r = impl(args)
      return { data: r.data ?? null, error: r.error ?? null }
    },
    from(table: string) {
      const rows = (opts.tables?.[table] ?? []) as Record<string, unknown>[]
      const result = Promise.resolve({ data: rows, error: null })
      const builder: Record<string, unknown> = {
        select: () => builder, eq: () => builder, order: () => builder,
        limit: () => builder, ilike: () => builder, in: () => builder,
        gte: () => builder, lte: () => builder,
        single: () => Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'no rows' } }),
        then: result.then.bind(result), catch: result.catch.bind(result),
      }
      return builder
    },
  }
  return { client: client as never, calls }
}
