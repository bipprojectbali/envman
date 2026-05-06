#!/usr/bin/env bun
/**
 * MCP Deploy Server — envman stg pipeline
 *
 * Standalone stdio server. Does NOT import from src/.
 * Tools: deploy, preflight, check_version, deploy_status
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { execSync, spawnSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'

// ── Config (env-driven, fallbacks for local dev) ──────────────────────────────

const STACK_NAME = process.env.STACK_NAME ?? 'envman'
const STACK_ENV = process.env.ENV ?? 'stg'
const BASE_URL = process.env.BASE_URL ?? 'https://envman.wibudev.com'
const GH_TOKEN = process.env.GH_TOKEN ?? ''
const REPO =
  process.env.GH_REPO ??
  (() => {
    try {
      const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim()
      const m = url.match(/github\.com[/:](.+?\/.+?)(?:\.git)?$/)
      if (m) return m[1]
    } catch {}
    return 'bipprojectbali/envman'
  })()

const ROOT = join(import.meta.dir, '..', '..')
const PKG_PATH = join(ROOT, 'package.json')

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(cmd: string, opts?: { cwd?: string; env?: NodeJS.ProcessEnv }): string {
  return execSync(cmd, {
    encoding: 'utf8',
    cwd: opts?.cwd ?? ROOT,
    env: { ...process.env, ...opts?.env },
  }).trim()
}

function tryRun(cmd: string, opts?: { cwd?: string }): string {
  try {
    return run(cmd, opts)
  } catch {
    return ''
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Version helpers ───────────────────────────────────────────────────────────

function readLocalVersion(): string {
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'))
  return pkg.version as string
}

function bumpVersion(current: string, type: 'patch' | 'minor' | 'major'): string {
  const [maj, min, pat] = current.split('.').map(Number)
  if (type === 'major') return `${maj + 1}.0.0`
  if (type === 'minor') return `${maj}.${min + 1}.0`
  return `${maj}.${min}.${pat + 1}`
}

function applyVersionBump(version: string) {
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'))
  pkg.version = version
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n')
}

// ── Version check (live staging) ─────────────────────────────────────────────

async function fetchLiveVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/version`, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return data.version ?? null
  } catch {
    return null
  }
}

async function waitForVersion(expected: string, timeoutMs = 300_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const live = await fetchLiveVersion()
    if (live === expected) return true
    await sleep(8_000)
  }
  return false
}

// ── Credential scan ───────────────────────────────────────────────────────────

const CREDENTIAL_PATTERNS: { name: string; re: RegExp }[] = [
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

const SENSITIVE_FILE_PATTERNS = [
  /^\.env(\.|$)/,
  /\.(pem|key|p12|pfx)$/,
  /^credentials\.json$/,
  /^service-account\.json$/,
  /^id_rsa$/,
  /^id_ed25519$/,
]

type CredIssue = { type: string; sample: string; count: number }

function scanCredentials(branch: string): { ok: boolean; issues: CredIssue[]; sensitiveFiles: string[] } {
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
      const sample = matches[0].slice(0, 20) + '***'
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

type MigrationCheck = { ok: boolean; warnings: string[] }

function checkMigrations(branch: string): MigrationCheck {
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

function isWorkingTreeClean(): boolean {
  return tryRun('git status --porcelain') === ''
}

function currentBranch(): string {
  return tryRun('git rev-parse --abbrev-ref HEAD')
}

function gitPushWithToken(branch: string): void {
  if (!GH_TOKEN) throw new Error('GH_TOKEN not set')
  const pushUrl = `https://oauth2:${GH_TOKEN}@github.com/${REPO}.git`
  run(`git push ${pushUrl} ${branch}`)
}

// ── GitHub Actions ────────────────────────────────────────────────────────────

function ghEnv() {
  return { ...process.env, GH_TOKEN }
}

function triggerPublish(version: string): string {
  const out = run(
    `gh workflow run publish.yml --ref ${STACK_ENV} -f stack_env=${STACK_ENV} -f tag=${version}`,
    { env: ghEnv() },
  )
  // gh prints the run URL on success, extract ID from it
  const urlMatch = out.match(/runs\/(\d+)/)
  if (urlMatch) return urlMatch[1]
  // Fallback: wait then fetch latest run
  Bun.sleepSync(5_000)
  return tryRun(
    `gh run list --workflow=publish.yml --branch=${STACK_ENV} --limit=1 --json databaseId --jq '.[0].databaseId'`,
    { env: ghEnv() },
  )
}

function triggerRePull(): string {
  const out = run(
    `gh workflow run re-pull.yml --ref ${STACK_ENV} -f stack_name=${STACK_NAME} -f stack_env=${STACK_ENV}`,
    { env: ghEnv() },
  )
  const urlMatch = out.match(/runs\/(\d+)/)
  if (urlMatch) return urlMatch[1]
  Bun.sleepSync(5_000)
  return tryRun(
    `gh run list --workflow=re-pull.yml --branch=${STACK_ENV} --limit=1 --json databaseId --jq '.[0].databaseId'`,
    { env: ghEnv() },
  )
}

async function waitForWorkflow(runId: string, timeoutMs = 600_000): Promise<'success' | 'failure' | 'timeout'> {
  if (!runId) return 'failure'
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(8_000)
    const out = tryRun(`gh run view ${runId} --json status,conclusion --jq '[.status,.conclusion]'`, { env: ghEnv() })
    try {
      const [status, conclusion] = JSON.parse(out) as [string, string]
      if (status === 'completed') return conclusion === 'success' ? 'success' : 'failure'
    } catch {}
  }
  return 'timeout'
}

// ── Step recorder ─────────────────────────────────────────────────────────────

type StepStatus = 'ok' | 'blocked' | 'failed' | 'skipped'
type Step = { step: string; status: StepStatus; detail?: string; issues?: CredIssue[] }

// ── Tool: preflight ───────────────────────────────────────────────────────────

function runPreflight() {
  const cred = scanCredentials(STACK_ENV)
  const mig = checkMigrations(STACK_ENV)
  return {
    credential_scan: { ok: cred.ok, issues: cred.issues, sensitive_files: cred.sensitiveFiles },
    migration_check: { ok: mig.ok, warnings: mig.warnings },
    deploy_safe: cred.ok && mig.ok,
  }
}

// ── Tool: check_version ───────────────────────────────────────────────────────

async function runCheckVersion() {
  const local = readLocalVersion()
  let target: string | null = null
  let targetError: string | null = null
  try {
    target = await fetchLiveVersion()
    if (!target) targetError = 'Could not fetch version from staging'
  } catch (e) {
    targetError = String(e)
  }
  return {
    local,
    target,
    target_url: `${BASE_URL}/api/version`,
    target_error: targetError,
    in_sync: local === target,
  }
}

// ── Tool: deploy_status ───────────────────────────────────────────────────────

function runDeployStatus() {
  const publishRuns = tryRun(
    `gh run list --workflow=publish.yml --branch=${STACK_ENV} --limit=3 --json databaseId,status,conclusion,displayTitle,createdAt --jq '.[]'`,
    { env: ghEnv() },
  )
  const repullRuns = tryRun(
    `gh run list --workflow=re-pull.yml --branch=${STACK_ENV} --limit=3 --json databaseId,status,conclusion,displayTitle,createdAt --jq '.[]'`,
    { env: ghEnv() },
  )
  const parse = (raw: string) => {
    if (!raw) return []
    try {
      return raw
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l))
    } catch {
      return []
    }
  }
  return {
    publish: parse(publishRuns),
    re_pull: parse(repullRuns),
    live_version: null, // filled async below
  }
}

// ── Tool: deploy ──────────────────────────────────────────────────────────────

async function runDeploy(bump: 'patch' | 'minor' | 'major', skipCommit: boolean) {
  const steps: Step[] = []

  // 1. Pre-checks
  if (currentBranch() !== STACK_ENV) {
    return {
      success: false,
      blocked_by: 'wrong_branch',
      hint: `Must be on branch '${STACK_ENV}'. Run: git checkout ${STACK_ENV}`,
      steps,
    }
  }
  if (!isWorkingTreeClean() && !skipCommit) {
    return {
      success: false,
      blocked_by: 'dirty_tree',
      hint: 'Working tree has uncommitted changes. Commit or stash first.',
      steps,
    }
  }

  // 2. Preflight
  const cred = scanCredentials(STACK_ENV)
  const mig = checkMigrations(STACK_ENV)

  if (!cred.ok) {
    const types = [...cred.issues.map((i) => i.type), ...cred.sensitiveFiles.map((f) => `file:${f}`)].join(', ')
    steps.push({ step: 'preflight', status: 'blocked', issues: cred.issues, detail: `Credential leak: ${types}` })
    return {
      success: false,
      blocked_by: cred.sensitiveFiles.length ? 'sensitive_file' : 'credential_leak',
      hint: `Fix before deploying: ${types}`,
      steps,
    }
  }
  if (!mig.ok) {
    steps.push({ step: 'preflight', status: 'blocked', detail: mig.warnings.join('; ') })
    return {
      success: false,
      blocked_by: 'migration_missing',
      hint: `Run: bun run db:migrate — then commit the migration`,
      steps,
    }
  }
  steps.push({
    step: 'preflight',
    status: 'ok',
    detail: mig.warnings.length ? `Warnings: ${mig.warnings.join('; ')}` : undefined,
  })

  // 3. Version bump + commit
  const prev = readLocalVersion()
  let version = prev

  if (!skipCommit) {
    version = bumpVersion(prev, bump)
    try {
      applyVersionBump(version)
      run(`git add package.json`)
      run(`git commit -m "chore: bump v${version}"`)
      steps.push({ step: 'bump_version', status: 'ok', detail: `${prev} → ${version}` })
    } catch (e) {
      steps.push({ step: 'bump_version', status: 'failed', detail: String(e) })
      return { success: false, blocked_by: 'commit_failed', hint: String(e), steps }
    }
  } else {
    steps.push({ step: 'bump_version', status: 'skipped', detail: `Using current version ${version}` })
  }

  // 4. Git push
  try {
    gitPushWithToken(STACK_ENV)
    steps.push({ step: 'push', status: 'ok', detail: `origin/${STACK_ENV}` })
  } catch (e) {
    steps.push({ step: 'push', status: 'failed', detail: String(e) })
    return { success: false, blocked_by: 'push_failed', hint: String(e), steps }
  }

  // 5. Trigger publish workflow
  let publishRunId = ''
  try {
    await sleep(2_000)
    publishRunId = triggerPublish(version)
    steps.push({ step: 'trigger_publish', status: 'ok', detail: `run_id: ${publishRunId}` })
  } catch (e) {
    steps.push({ step: 'trigger_publish', status: 'failed', detail: String(e) })
    return { success: false, blocked_by: 'workflow_trigger_failed', hint: String(e), steps }
  }

  // 6. Wait for publish
  const publishResult = await waitForWorkflow(publishRunId, 600_000)
  steps.push({ step: 'publish_workflow', status: publishResult === 'success' ? 'ok' : 'failed', detail: publishResult })
  if (publishResult !== 'success') {
    return {
      success: false,
      blocked_by: 'publish_failed',
      hint: `publish.yml ${publishResult}. Check: gh run view ${publishRunId}`,
      steps,
    }
  }

  // 7. Trigger re-pull
  let repullRunId = ''
  try {
    await sleep(2_000)
    repullRunId = triggerRePull()
    steps.push({ step: 'trigger_repull', status: 'ok', detail: `run_id: ${repullRunId}` })
  } catch (e) {
    steps.push({ step: 'trigger_repull', status: 'failed', detail: String(e) })
    return { success: false, blocked_by: 'repull_trigger_failed', hint: String(e), steps }
  }

  // 8. Wait for re-pull
  const repullResult = await waitForWorkflow(repullRunId, 300_000)
  steps.push({ step: 'repull_workflow', status: repullResult === 'success' ? 'ok' : 'failed', detail: repullResult })
  if (repullResult !== 'success') {
    return {
      success: false,
      blocked_by: 'repull_failed',
      hint: `re-pull.yml ${repullResult}. Check: gh run view ${repullRunId}`,
      steps,
    }
  }

  // 9. Verify version live
  const verified = await waitForVersion(version, 300_000)
  steps.push({
    step: 'verify',
    status: verified ? 'ok' : 'failed',
    detail: verified ? `${BASE_URL} → ${version}` : `Timeout waiting for v${version}`,
  })

  return {
    success: verified,
    version,
    target_url: BASE_URL,
    steps,
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'deploy-stg', version: '1.0.0' })

server.tool(
  'deploy',
  'Full deploy pipeline: preflight → bump → commit → push → publish image → redeploy → verify',
  {
    bump: z.enum(['patch', 'minor', 'major']).default('patch').describe('Semver bump type'),
    skip_commit: z.boolean().default(false).describe('Skip version bump and commit (re-deploy current version)'),
  },
  async ({ bump, skip_commit }) => {
    const result = await runDeploy(bump, skip_commit)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

server.tool('preflight', 'Scan for credential leaks and migration drift without deploying', {}, async () => {
  const result = runPreflight()
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
})

server.tool('check_version', 'Compare local package.json version vs live staging', {}, async () => {
  const result = await runCheckVersion()
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
})

server.tool('deploy_status', 'Show recent GitHub Actions workflow runs for publish and re-pull', {}, async () => {
  const result = runDeployStatus()
  const live = await fetchLiveVersion()
  return { content: [{ type: 'text', text: JSON.stringify({ ...result, live_version: live }, null, 2) }] }
})

const transport = new StdioServerTransport()
await server.connect(transport)
