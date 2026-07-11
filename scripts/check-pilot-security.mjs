// Security regression gate. Fails loudly; run after `npm run build && npm run build:pilot`.
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const failures = []

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? filesUnder(p) : [p]
  })
}
function scan(dir, patterns) {
  for (const file of filesUnder(dir)) {
    const content = readFileSync(file, 'latin1')
    for (const [label, re] of patterns) {
      if (re.test(content)) failures.push(`${label} in ${file}`)
    }
  }
}

// 1. No server-side secrets in EITHER bundle.
const secretPatterns = [
  ['service_role reference', /service_role/],
  ['supabase secret key', /sb_secret_/],
  ['postgres connection string', /postgres(ql)?:\/\/[^ '"]+:[^ '"]+@/],
]
scan('dist', secretPatterns)
scan('dist-pilot', secretPatterns)

// 2. The DEMO bundle must not know Supabase exists (no URL, no key, no client lib).
scan('dist', [
  ['supabase reference in demo bundle', /supabase/i],
  ['anon key (JWT) in demo bundle', /eyJhbGciOi/],
])

// 3. No env files tracked by git.
const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n')
for (const f of tracked) {
  if (/^\.env(\..+)?$/.test(f) && f !== '.env.example') failures.push(`env file tracked: ${f}`)
}

// 4. Dependency audit (high+ fails the gate).
try {
  execSync('npm audit --audit-level=high', { stdio: 'pipe' })
} catch {
  failures.push('npm audit found high/critical advisories')
}

if (failures.length > 0) {
  console.error('SECURITY CHECK FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
console.log('security checks passed')
