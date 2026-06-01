// Resurrect — restore process list dari processes.json setelah daemon restart.
//
// Bug yang dimitigasi:
//   D4 ✓ Orphan child setelah daemon crash → kill old PID kalau masih hidup
//   D7 ✓ Validasi PID + start_epoch sebelum kill (avoid kill random PID)
//        Decision: tidak adopt orphan (kehilangan stdout/stderr fd), KILL + respawn.

import { log } from './logger'
import { getProcessStartEpoch, isPidAlive } from './pidfile'
import type { ProcessManager } from './process-manager'
import type { PersistedProcess } from './state-store'

const PID_HIJACK_TOLERANCE_MS = 2000

/**
 * Restore semua process dari persisted state.
 * Untuk setiap record:
 *   1. Cek apakah PID lama masih hidup + start_epoch cocok
 *   2. Kalau ya: orphan dari daemon sebelumnya — kill (kita kehilangan fd handle)
 *   3. Spawn ulang config
 */
export async function resurrectProcesses(
  pm: ProcessManager,
  processes: PersistedProcess[],
): Promise<{ restored: number; skipped: number; failed: number; killedOrphans: number }> {
  let restored = 0
  let skipped = 0
  let failed = 0
  let killedOrphans = 0

  for (const proc of processes) {
    try {
      // Step 1: Cek orphan
      if (proc.lastPid !== null && proc.lastStartEpochMs !== null && isPidAlive(proc.lastPid)) {
        const actualStart = getProcessStartEpoch(proc.lastPid)
        if (actualStart !== null && Math.abs(actualStart - proc.lastStartEpochMs) <= PID_HIJACK_TOLERANCE_MS) {
          // Match — ini orphan child dari daemon sebelumnya
          log.warn('killing orphan child', {
            name: proc.name,
            pid: proc.lastPid,
          })
          try {
            process.kill(proc.lastPid, 'SIGTERM')
            // Tunggu kernel reap, maksimal 2s
            const deadline = Date.now() + 2000
            while (isPidAlive(proc.lastPid) && Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, 100))
            }
            if (isPidAlive(proc.lastPid)) {
              process.kill(proc.lastPid, 'SIGKILL')
            }
            killedOrphans++
          } catch (e: any) {
            log.warn('orphan kill failed', { pid: proc.lastPid, error: e.message })
          }
        } else {
          // PID hidup tapi start_epoch beda — PID hijack, leave alone (bukan child kita)
          log.info('PID hijack detected, leaving alone', {
            recordPid: proc.lastPid,
            recordStart: proc.lastStartEpochMs,
            actualStart,
          })
        }
      }

      // Step 2: Spawn ulang
      try {
        await pm.start({
          name: proc.name,
          command: proc.command,
          cwd: proc.cwd,
          staticEnv: proc.staticEnv,
          envmanEnv: proc.envmanEnv,
          envSources: proc.envSources,
          logOutPath: proc.logOutPath,
          logErrPath: proc.logErrPath,
          options: proc.options,
        })
        restored++
      } catch (e: any) {
        // Name collision atau invalid config — skip, tetap log
        if (e.code === 'CONFLICT') {
          log.info('process already exists, skipping resurrect', { name: proc.name })
          skipped++
        } else {
          log.error('resurrect spawn failed', { name: proc.name, error: e.message })
          failed++
        }
      }
    } catch (e: any) {
      log.error('resurrect record failed', { name: proc.name, error: e.message })
      failed++
    }
  }

  log.info('resurrect complete', { restored, skipped, failed, killedOrphans })
  return { restored, skipped, failed, killedOrphans }
}
