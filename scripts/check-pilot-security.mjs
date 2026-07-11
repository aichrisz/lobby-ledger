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
scan('dist-pilot', [
  ['Supabase reference in pilot browser bundle', /supabase/i],
  ['Vite Supabase variable in pilot browser bundle', /VITE_SUPABASE/],
  ['anon key (JWT) in pilot browser bundle', /eyJhbGciOi/],
])

// The simple pilot frontend may call only same-origin server APIs.
scan('src/pilot/simple', [
  ['Supabase import in simple pilot frontend', /@supabase|VITE_SUPABASE/],
  ['server environment reference in simple pilot frontend', /SUPABASE_SERVICE_ROLE_KEY|PILOT_SESSION_SECRET|PILOT_PIN|PILOT_ORGANIZATION_ID/],
])
scan('api', [['Vite environment reference in server API', /VITE_/]])

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

const pilotHtml = readFileSync('pilot.html', 'utf8')
if (!/connect-src 'self'/.test(pilotHtml) || /connect-src[^;]*(https?:|\*)/.test(pilotHtml)) {
  failures.push('pilot CSP permits a non-same-origin connection')
}
const serviceWorker = readFileSync('public/sw.js', 'utf8')
if (!/pathname\.startsWith\('\/api\/'\)/.test(serviceWorker)) {
  failures.push('service worker does not exclude API responses')
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
