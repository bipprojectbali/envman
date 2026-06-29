import { homedir } from 'node:os'
import { join } from 'node:path'
import { version as PKG_VERSION } from '../../package.json'

export const CONFIG_DIR = join(homedir(), '.config', 'envman')
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
export const UPDATE_CACHE_FILE = join(CONFIG_DIR, 'update-check.json')
export const VERSION = PKG_VERSION
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000
