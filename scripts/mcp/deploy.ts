#!/usr/bin/env bun
/**
 * MCP Deploy Server — envman stg pipeline
 *
 * Standalone stdio server. Does NOT import from src/.
 * Tools: deploy, preflight, check_version, deploy_status
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { execSync } from 'child_process'
import { join } from 'path'
import { z } from 'zod'
import {
  applyVersionBump,
  bumpVersion,
  checkMigrations,
  currentBranch,
  fetchLiveVersion,
  gitPushWithToken,
  isWorkingTreeClean,
  readLocalVersion,
  scanCredentials,
  triggerPublish,
  triggerRePull,
  waitForVersion,
  waitForWorkflow,
} from './deploy-helpers.js'
import type { CredIssue } from './deploy-helpers.js'

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

function tryRun(cmd: string, opts?: { cwd?: string; env?: NodeJS.ProcessEnv }): string {
  try {
    return run(cmd, opts)
  } catch {
    return ''
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Step recorder ─────────────────────────────────────────────────────────────

type StepStatus = 'ok' | 'blocked' | 'failed' | 'skipped'
type Step = { step: string; status: StepStatus; detail?: string; issues?: CredIssue[] }

// ── Tool: preflight ───────────────────────────────────────────────────────────

function runPreflight() {
  const cred = scanCredentials(STACK_ENV, tryRun)
  const mig = checkMigrations(STACK_ENV, tryRun)
  return {
    credential_scan: { ok: cred.ok, issues: cred.issues, sensitive_files: cred.sensitiveFiles },
    migration_check: { ok: mig.ok, warnings: mig.warnings },
    deploy_safe: cred.ok && mig.ok,
  }
}

// ── Tool: check_version ───────────────────────────────────────────────────────

async function runCheckVersion() {
  const local = readLocalVersion(PKG_PATH)
  let target: string | null = null
  let targetError: string | null = null
  try {
    target = await fetchLiveVersion(BASE_URL)
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
    { env: { ...process.env, GH_TOKEN } },
  )
  const repullRuns = tryRun(
    `gh run list --workflow=re-pull.yml --branch=${STACK_ENV} --limit=3 --json databaseId,status,conclusion,displayTitle,createdAt --jq '.[]'`,
    { env: { ...process.env, GH_TOKEN } },
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
  if (currentBranch(tryRun) !== STACK_ENV) {
    return {
      success: false,
      blocked_by: 'wrong_branch',
      hint: `Must be on branch '${STACK_ENV}'. Run: git checkout ${STACK_ENV}`,
      steps,
    }
  }
  if (!isWorkingTreeClean(tryRun) && !skipCommit) {
    return {
      success: false,
      blocked_by: 'dirty_tree',
      hint: 'Working tree has uncommitted changes. Commit or stash first.',
      steps,
    }
  }

  // 2. Preflight
  const cred = scanCredentials(STACK_ENV, tryRun)
  const mig = checkMigrations(STACK_ENV, tryRun)

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
  const prev = readLocalVersion(PKG_PATH)
  let version = prev

  if (!skipCommit) {
    version = bumpVersion(prev, bump)
    try {
      applyVersionBump(PKG_PATH, version)
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
    gitPushWithToken(STACK_ENV, GH_TOKEN, REPO, run)
    steps.push({ step: 'push', status: 'ok', detail: `origin/${STACK_ENV}` })
  } catch (e) {
    steps.push({ step: 'push', status: 'failed', detail: String(e) })
    return { success: false, blocked_by: 'push_failed', hint: String(e), steps }
  }

  // 5. Trigger publish workflow
  let publishRunId = ''
  try {
    await sleep(2_000)
    publishRunId = triggerPublish(version, STACK_ENV, GH_TOKEN, run, tryRun)
    steps.push({ step: 'trigger_publish', status: 'ok', detail: `run_id: ${publishRunId}` })
  } catch (e) {
    steps.push({ step: 'trigger_publish', status: 'failed', detail: String(e) })
    return { success: false, blocked_by: 'workflow_trigger_failed', hint: String(e), steps }
  }

  // 6. Wait for publish
  const publishResult = await waitForWorkflow(publishRunId, GH_TOKEN, sleep, tryRun, 600_000)
  steps.push({ step: 'publish_workflow', status: publishResult === 'success' ? 'ok' : 'failed', detail: publishResult })
  if (publishResult !== 'success') {
    return {
      success: false,
      blocked_by: 'publish_failed',
      hint: `publish.yml ${publishResult}. Check: gh run view ${publishRunId}`,
      steps,
    }
  }

  // Helper: trigger re-pull and wait for it to complete
  const doRePull = async (label: string): Promise<boolean> => {
    let runId = ''
    try {
      await sleep(45_000) // wait for GHCR to fully propagate the new image
      runId = triggerRePull(STACK_NAME, STACK_ENV, GH_TOKEN, run, tryRun)
      steps.push({ step: label, status: 'ok', detail: `run_id: ${runId}` })
    } catch (e) {
      steps.push({ step: label, status: 'failed', detail: String(e) })
      return false
    }
    const result = await waitForWorkflow(runId, GH_TOKEN, sleep, tryRun, 300_000)
    steps.push({ step: `${label}_workflow`, status: result === 'success' ? 'ok' : 'failed', detail: result })
    return result === 'success'
  }

  // 7. Trigger re-pull (first attempt)
  const repull1ok = await doRePull('trigger_repull')
  if (!repull1ok) {
    return { success: false, blocked_by: 'repull_failed', hint: 're-pull.yml failed. Check GitHub Actions.', steps }
  }

  // 8. Verify version live (7 min window)
  const verified = await waitForVersion(BASE_URL, version, sleep, 420_000)
  if (verified) {
    steps.push({ step: 'verify', status: 'ok', detail: `${BASE_URL} → ${version}` })
    return { success: true, version, target_url: BASE_URL, steps }
  }

  // 9. Verify failed — auto-retry re-pull once (Portainer may have pulled old image)
  steps.push({ step: 'verify', status: 'failed', detail: `Timeout — retrying re-pull once` })
  const repull2ok = await doRePull('trigger_repull_retry')
  if (!repull2ok) {
    return { success: false, blocked_by: 'repull_retry_failed', hint: 're-pull retry failed.', steps }
  }

  const verified2 = await waitForVersion(BASE_URL, version, sleep, 420_000)
  steps.push({
    step: 'verify_retry',
    status: verified2 ? 'ok' : 'failed',
    detail: verified2 ? `${BASE_URL} → ${version}` : `Timeout waiting for v${version} after retry`,
  })

  return {
    success: verified2,
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
  const live = await fetchLiveVersion(BASE_URL)
  return { content: [{ type: 'text', text: JSON.stringify({ ...result, live_version: live }, null, 2) }] }
})

const transport = new StdioServerTransport()
await server.connect(transport)
