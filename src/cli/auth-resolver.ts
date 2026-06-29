import { existsSync, readFileSync } from 'node:fs'
import { CONFIG_FILE } from './constants'

export interface Config {
  server: string
  token: string
}

// Priority (highest → lowest):
//   1. Local file vars (ENVMAN_SERVER + ENVMAN_TOKEN from parsed -e files)
//   2. System env vars (ENVMAN_SERVER + ENVMAN_TOKEN from process.env / .bashrc)
//   3. Config file    (~/.config/envman/config.json from `envman login`)
export function resolveAuth(localVars: Record<string, string>): Config {
  if (localVars.ENVMAN_SERVER && localVars.ENVMAN_TOKEN) {
    return { server: localVars.ENVMAN_SERVER, token: localVars.ENVMAN_TOKEN }
  }
  if (process.env.ENVMAN_SERVER && process.env.ENVMAN_TOKEN) {
    return { server: process.env.ENVMAN_SERVER, token: process.env.ENVMAN_TOKEN }
  }
  if (existsSync(CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
      if (cfg.server && cfg.token) return cfg
    } catch {}
  }
  console.error(
    '[envman] Not authenticated. Options:\n' +
      '  1. Run: envman login <server-url> --token <token>\n' +
      '  2. Set env vars: ENVMAN_SERVER=<url> ENVMAN_TOKEN=<token>\n' +
      '  3. Add ENVMAN_SERVER and ENVMAN_TOKEN to a local file passed with -e',
  )
  process.exit(1)
}

// Returns saved server URL without calling process.exit (for background update check)
export function getSavedServerUrl(): string | null {
  try {
    if (process.env.ENVMAN_SERVER) return process.env.ENVMAN_SERVER
    if (existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
      if (cfg.server) return cfg.server
    }
  } catch {}
  return null
}
