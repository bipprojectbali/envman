// Shared types and helpers for MCP tools.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Config } from './api-client'

export interface ToolContext {
  cfg: Config
  /** True if --write flag was passed AND token has canWrite */
  writeEnabled: boolean
  /** True if daemon was reachable at startup probe */
  hasDaemon: boolean
}

export interface ToolModule {
  /** Register all tools in this module with the server. */
  register: (server: McpServer, ctx: ToolContext) => void
}

// ─── response helpers ─────────────────────────────────────────────────────────

interface TextContent {
  type: 'text'
  text: string
}

export interface ToolResponse {
  content: TextContent[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
  [k: string]: unknown
}

/** Wrap structured data in MCP response format (text + structuredContent). */
export function jsonResponse(data: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  }
}

/** Wrap markdown-formatted text + structured data. */
export function markdownResponse(text: string, structured: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text }],
    structuredContent: structured,
  }
}

/** Plain text response (for simple confirmations or empty results). */
export function textResponse(text: string): ToolResponse {
  return { content: [{ type: 'text', text }] }
}

/** Error response — Claude can parse and recover. */
export function errorResponse(text: string): ToolResponse {
  return { isError: true, content: [{ type: 'text', text: `Error: ${text}` }] }
}
