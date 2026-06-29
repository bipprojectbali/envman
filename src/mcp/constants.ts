// MCP server constants.
//
// CHARACTER_LIMIT: per-response budget. Mitigates Claude Desktop stdio buffering
// bug (B3) and keeps responses agent-friendly. Anthropic reference uses 25_000.

export const CHARACTER_LIMIT = 25_000
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200
export const HTTP_TIMEOUT_READ_MS = 15_000
export const HTTP_TIMEOUT_WRITE_MS = 30_000
export const AUDIT_TIMEOUT_MS = 3_000
export const WHOAMI_CACHE_TTL_MS = 60_000
