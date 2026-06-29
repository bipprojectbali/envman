import { readFileSync, writeFileSync } from 'fs'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RunFn = (cmd: string, opts?: { cwd?: string; env?: NodeJS.ProcessEnv }) => string
export type TryRunFn = (cmd: string, opts?: { cwd?: string; env?: NodeJS.ProcessEnv }) => string
export type SleepFn = (ms: number) => Promise<void>

export type CredIssue = { type: string; sample: string; count: number }
export type MigrationCheck = { ok: boolean; warnings: string[] }

// ── Version helpers ───────────────────────────────────────────────────────────

export function readLocalVersion(pkgPath: string): string {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  return pkg.version as string
}

export function bumpVersion(current: string, type: 'patch' | 'minor' | 'major'): string {
  const [maj, min, pat] = current.split('.').map(Number)
  if (type === 'major') return `${maj + 1}.0.0`
  if (type === 'minor') return `${maj}.${min + 1}.0`
  return `${maj}.${min}.${pat + 1}`
}

export function applyVersionBump(pkgPath: string, version: string) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.version = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
}

// ── Version check (live staging) ─────────────────────────────────────────────

export async function fetchLiveVersion(baseUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return data.version ?? null
  } catch {
    return null
  }
}

export async function waitForVersion(
  baseUrl: string,
  expected: string,
  sleep: SleepFn,
  timeoutMs = 300_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const live = await fetchLiveVersion(baseUrl)
    if (live === expected) return true
    await sleep(8_000)
  }
  return false
}

// ── Credential scan ───────────────────────────────────────────────────────────

export const CREDENTIAL_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'anthropic_key', re: /sk-ant-[a-zA-Z0-9\-_]{20,}/ },
  { name: 'openai_key', re: /sk-[a-zA-Z0-9]{48}/ },
  { name: 'stripe_key', re: /sk_(live|test)_[a-zA-Z0-9]{24,}/ },
  { name: 'github_pat', re: /ghp_[a-zA-Z0-9]{36,}/ },
  { name: 'github_oauth', re: /gho_[a-zA-Z0-9]{36,}/ },
  { name: 'github_fine_grained', re: /github_pat_[a-zA-Z0-9_]{22,}/ },
  { name: 'slack_token', re: /xox[baprs]-[a-zA-Z0-9\-]{20,}/ },
  { name: 'google_api_key', re: /AIza[a-zA-Z0-9\-_]{35}/ },
  { name: 'google_oauth_token', re: /ya29\.[a-zA-Z0-9\-_]{20,}/ },
  { name: 'private_key_pem', re: /-----BEGIN [A-Z ]+ PRIVATE KEY-----/ },
  { name: 'db_url_with_creds', re: /(postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/ },
  { name: 'hardcoded_secret', re: /(password|secret|token)\s*[:=]\s*["'][^"']{8,}["']/i },
]

export const SENSITIVE_FILE_PATTERNS = [
  /^\.env(\.|$)/,
  /\.(pem|key|p12|pfx)$/,
  /^credentials\.json$/,
  /^service-account\.json$/,
  /^id_rsa$/,
  /^id_ed25519$/,
]

export function scanCredentials(
  branch: string,
  tryRun: TryRunFn,
): { ok: boolean; issues: CredIssue[]; sensitiveFiles: string[] } {
  const diff = tryRun(
    `git diff origin/${branch}..HEAD -- . ":(exclude)*.lock" ":(exclude)bun.lock" ":(exclude)package-lock.json"`,
  )
  const addedLines = diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .join('\n')

  const issues: CredIssue[] = []
  for (const { name, re } of CREDENTIAL_PATTERNS) {
    const matches = addedLines.match(new RegExp(re.source, 'g')) ?? []
    if (matches.length > 0) {
      const sample = (matches[0] ?? '').slice(0, 20) + '***'
      issues.push({ type: name, sample, count: matches.length })
    }
  }

  const changedFiles = tryRun(`git diff --name-only origin/${branch}..HEAD`).split('\n').filter(Boolean)
  const sensitiveFiles = changedFiles.filter((f) => {
    const base = f.split('/').pop() ?? f
    return SENSITIVE_FILE_PATTERNS.some((re) => re.test(base))
  })

  return { ok: issues.length === 0 && sensitiveFiles.length === 0, issues, sensitiveFiles }
}

// ── Migration check (Prisma) ──────────────────────────────────────────────────

export function checkMigrations(branch: string, tryRun: TryRunFn): MigrationCheck {
  const warnings: string[] = []

  const schemaChanged = tryRun(
    `git diff origin/${branch}..HEAD -- prisma/schema.prisma`,
  )
  const newMigrations = tryRun(
    `git diff --name-only origin/${branch}..HEAD -- prisma/migrations/`,
  )
    .split('\n')
    .filter(Boolean)

  if (schemaChanged && newMigrations.length === 0) {
    return { ok: false, warnings: ['Schema changed but no migration files found'] }
  }
  if (newMigrations.length > 0) {
    warnings.push(`New migrations: ${newMigrations.join(', ')}`)
  }

  const unstagedMigrations = tryRun('git ls-files --others --exclude-standard prisma/migrations/')
    .split('\n')
    .filter(Boolean)
  if (unstagedMigrations.length > 0) {
    warnings.push(`Unstaged migration files: ${unstagedMigrations.join(', ')}`)
  }

  return { ok: true, warnings }
}

// ── Git operations ────────────────────────────────────────────────────────────

export function isWorkingTreeClean(tryRun: TryRunFn): boolean {
  return tryRun('git status --porcelain') === ''
}

export function currentBranch(tryRun: TryRunFn): string {
  return tryRun('git rev-parse --abbrev-ref HEAD')
}

export function gitPushWithToken(branch: string, ghToken: string, repo: string, run: RunFn): void {
  if (!ghToken) throw new Error('GH_TOKEN not set')
  const pushUrl = `https://oauth2:${ghToken}@github.com/${repo}.git`
  run(`git push ${pushUrl} ${branch}`)
}

// ── GitHub Actions ────────────────────────────────────────────────────────────

export function ghEnv(ghToken: string) {
  return { ...process.env, GH_TOKEN: ghToken }
}

export function getLatestRunId(workflow: string, stackEnv: string, ghToken: string, tryRun: TryRunFn): string {
  return tryRun(
    `gh run list --workflow=${workflow} --branch=${stackEnv} --limit=1 --json databaseId --jq '.[0].databaseId'`,
    { env: ghEnv(ghToken) },
  )
}

export function triggerAndGetRunId(
  workflow: string,
  args: string,
  stackEnv: string,
  ghToken: string,
  run: RunFn,
  tryRun: TryRunFn,
): string {
  // Snapshot run ID before triggering — new run must be different
  const prevRunId = getLatestRunId(workflow, stackEnv, ghToken, tryRun)

  run(`gh workflow run ${workflow} --ref ${stackEnv} ${args}`, { env: ghEnv(ghToken) })

  // Poll until a NEW run ID appears (up to 30s)
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    Bun.sleepSync(3_000)
    const newRunId = getLatestRunId(workflow, stackEnv, ghToken, tryRun)
    if (newRunId && newRunId !== prevRunId) return newRunId
  }
  return ''
}

export function triggerPublish(
  version: string,
  stackEnv: string,
  ghToken: string,
  run: RunFn,
  tryRun: TryRunFn,
): string {
  return triggerAndGetRunId(
    'publish.yml',
    `-f stack_env=${stackEnv} -f tag=${version}`,
    stackEnv,
    ghToken,
    run,
    tryRun,
  )
}

export function triggerRePull(
  stackName: string,
  stackEnv: string,
  ghToken: string,
  run: RunFn,
  tryRun: TryRunFn,
): string {
  return triggerAndGetRunId(
    're-pull.yml',
    `-f stack_name=${stackName} -f stack_env=${stackEnv}`,
    stackEnv,
    ghToken,
    run,
    tryRun,
  )
}

export async function waitForWorkflow(
  runId: string,
  ghToken: string,
  sleep: SleepFn,
  tryRun: TryRunFn,
  timeoutMs = 600_000,
): Promise<'success' | 'failure' | 'timeout'> {
  if (!runId) return 'failure'
  const deadline = Date.now() + timeoutMs
  let seenActive = false // must see queued/in_progress before accepting completed

  while (Date.now() < deadline) {
    await sleep(8_000)
    const out = tryRun(
      `gh run view ${runId} --json status,conclusion,createdAt --jq '[.status,.conclusion,.createdAt]'`,
      { env: ghEnv(ghToken) },
    )
    try {
      const [status, conclusion, createdAt] = JSON.parse(out) as [string, string, string]

      // Reject stale run IDs — run must have been created within last 10 minutes
      const ageMs = Date.now() - new Date(createdAt).getTime()
      if (ageMs > 10 * 60 * 1000) return 'failure'

      if (status === 'queued' || status === 'in_progress') seenActive = true
      if (status === 'completed') {
        if (!seenActive) return 'failure' // got a stale completed run, not ours
        return conclusion === 'success' ? 'success' : 'failure'
      }
    } catch {}
  }
  return 'timeout'
}
