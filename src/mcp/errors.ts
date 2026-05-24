// Error mapping: HTTP status → MCP tool error response.
// Bug E1, E2 mitigation: tidak pernah throw raw — selalu return { isError: true, content }.

export class McpToolError extends Error {
  constructor(public userMessage: string, public httpStatus?: number) {
    super(userMessage)
  }
}

export class AuthError extends McpToolError {
  constructor(message = 'Token invalid or expired. Re-run `envman login` and restart the MCP server.') {
    super(message, 401)
  }
}

export class ForbiddenError extends McpToolError {
  constructor(message = 'Permission denied. Token may be read-only or scope-restricted.') {
    super(message, 403)
  }
}

export class NotFoundError extends McpToolError {
  constructor(resource: string, hint?: string) {
    super(`${resource} not found.${hint ? ` ${hint}` : ''}`, 404)
  }
}

export class ConflictError extends McpToolError {
  constructor(message: string) {
    super(message, 409)
  }
}

export class NetworkError extends McpToolError {
  constructor(url: string) {
    super(`Cannot reach envman server at ${url}. Check network or server URL.`)
  }
}

const REDACT_LIMIT = 200

function safeBody(body: string): string {
  // Redact known token patterns and truncate
  const cleaned = body
    .replace(/em_[a-f0-9]{16,}/gi, 'em_***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"***"')
    .replace(/"password"\s*:\s*"[^"]+"/gi, '"password":"***"')
  return cleaned.length > REDACT_LIMIT ? cleaned.slice(0, REDACT_LIMIT) + '...' : cleaned
}

/**
 * Map HTTP error response → user-facing message. Each branch gives the agent
 * a hint on how to recover, per agent-ergonomics principle.
 */
export function mapHttpError(status: number, body: string, resource = 'Resource', listHint?: string): McpToolError {
  const safe = safeBody(body)
  switch (status) {
    case 401:
      return new AuthError()
    case 403:
      return new ForbiddenError(
        `Permission denied for ${resource}. Token must have canWrite=true and scope matching this project. Server said: ${safe}`,
      )
    case 404:
      return new NotFoundError(resource, listHint)
    case 409:
      return new ConflictError(`Conflict on ${resource}: ${safe}`)
    case 422:
    case 400:
      return new McpToolError(`Bad request: ${safe}`, status)
    case 429:
      return new McpToolError('Rate limit exceeded. Wait a moment before retrying.', 429)
    default:
      if (status >= 500) {
        return new McpToolError(`Server error (HTTP ${status}). Retry later. Body: ${safe}`, status)
      }
      return new McpToolError(`HTTP ${status}: ${safe}`, status)
  }
}

/**
 * Convert any error → MCP tool error response (isError: true).
 * NEVER let an exception escape the handler — Claude Code stdio has no auto-reconnect.
 */
export function toErrorResponse(e: unknown): { isError: true; content: Array<{ type: 'text'; text: string }>; [k: string]: unknown } {
  let text: string
  if (e instanceof McpToolError) {
    text = `Error: ${e.userMessage}`
  } else if (e instanceof Error) {
    text = `Error: ${e.message}`
  } else {
    text = `Error: ${String(e)}`
  }
  return { isError: true, content: [{ type: 'text', text }] }
}
