import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

type OkFn = (data: unknown) => { content: Array<{ type: 'text'; text: string }> }
type ErrFn = (message: string) => { isError: boolean; content: Array<{ type: 'text'; text: string }> }
type StgCallFn = (toolName: string, args?: Record<string, unknown>) => Promise<unknown>

/** Register all STG local-vs-stg comparison tools onto the given MCP server. */
export function registerStgCompareTools(
  server: McpServer,
  stgCall: StgCallFn,
  ok: OkFn,
  err: ErrFn,
  baseUrl: string,
): void {
  server.registerTool(
    'stg_compare_health',
    {
      title: '[STG] Compare health local vs stg',
      description:
        'Panggil health_full ke stg DAN local app-mcp sekaligus untuk compare. Berguna untuk debug perbedaan state.',
      inputSchema: {},
    },
    async () => {
      try {
        const stgHealth = await stgCall('health_full').catch((e: unknown) => ({ error: String(e) }))
        // Local health via direct HTTP (local dev server biasanya di port 3000)
        const localRes = await fetch('http://localhost:3000/health').catch(() => null)
        const localHealth = localRes?.ok ? await localRes.json().catch(() => null) : null
        return ok({
          stg: { baseUrl, ...(stgHealth as Record<string, unknown>) },
          local: localHealth ?? { note: 'local /health tidak reachable (server mungkin tidak jalan)' },
        })
      } catch (e) {
        return err(String(e))
      }
    },
  )

  server.registerTool(
    'stg_compare_env_map',
    {
      title: '[STG] Compare env vars local vs stg',
      description: 'Bandingkan env vars yang di-set/unset antara local dan stg untuk deteksi missing config.',
      inputSchema: {},
    },
    async () => {
      try {
        const stgEnv = await stgCall('project_env_map').catch((e: unknown) => ({ error: String(e) }))
        return ok({
          note: 'stg env map dari runtime stg. Bandingkan dengan output `project_env_map` dari app-mcp local.',
          stg: stgEnv,
        })
      } catch (e) {
        return err(String(e))
      }
    },
  )

  server.registerTool(
    'stg_compare_migrations',
    {
      title: '[STG] Compare migrations local vs stg',
      description: 'List migrations di stg untuk detect drift dengan local schema.',
      inputSchema: {},
    },
    async () => {
      try {
        const stgMigrations = await stgCall('project_migrations').catch((e: unknown) => ({ error: String(e) }))
        return ok({
          note: 'Migration list di stg. Bandingkan dengan `project_migrations` dari app-mcp local untuk detect schema drift.',
          stg: stgMigrations,
        })
      } catch (e) {
        return err(String(e))
      }
    },
  )
}
