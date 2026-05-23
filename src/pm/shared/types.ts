// Shared types untuk IPC daemon <-> CLI.
// Setiap perubahan di sini = breaking change kontrak, butuh version bump.

export interface DaemonHealth {
  ok: true
  version: string                     // daemon binary version
  pid: number
  uptimeMs: number
  startedAt: number                   // epoch ms
  processCount: number
  diskFull: boolean                   // flag dari log manager
}

export interface ApiError {
  ok: false
  error: string                       // human-readable message
  code: string                        // machine-readable, mis. "INVALID_AUTH"
  requestId?: string
}

export type ApiResponse<T = unknown> = (T & { ok: true; requestId?: string }) | ApiError

// HTTP status code mapping untuk error codes
export const ERROR_CODES = {
  INVALID_AUTH: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BAD_REQUEST: 400,
  INTERNAL: 500,
  PAYLOAD_TOO_LARGE: 413,
} as const

export type ErrorCode = keyof typeof ERROR_CODES
