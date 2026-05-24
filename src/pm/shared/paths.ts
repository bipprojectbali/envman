// File paths untuk envman pm — single source of truth.
// Bisa di-override via env var ENVMAN_PM_HOME untuk testing.

import { homedir } from 'os'
import { join } from 'path'

export function pmHome(): string {
  return process.env.ENVMAN_PM_HOME ?? join(homedir(), '.config', 'envman')
}

export function paths() {
  const home = pmHome()
  const run = join(home, 'run')
  return {
    home,
    run,
    config: join(home, 'config.json'),
    token: join(home, 'daemon.token'),
    pidfile: join(run, 'daemon.pid'),
    socket: join(run, 'daemon.sock'),
    daemonLog: join(run, 'daemon.log'),
    processesFile: join(run, 'processes.json'),
    processesBackup: join(run, 'processes.json.bak'),
    logsDir: join(run, 'logs'),
  } as const
}

export type Paths = ReturnType<typeof paths>
