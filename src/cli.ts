#!/usr/bin/env bun
import { cmdDocs, cmdLogin, cmdLogout, cmdWhoami, printHelp } from './cli/commands'
import { VERSION } from './cli/constants'
import { getSavedServerUrl } from './cli/auth-resolver'
import { cmdAlias, cmdRun, detectsNpmImports, isProjectFileRef } from './cli/run'
import { cmdUpdate, runBgUpdateCheck, showUpdateNoticeFromCache, spawnUpdateCheck } from './cli/update'

// Public API: detectsNpmImports is used by MCP and other internal callers
export { detectsNpmImports } from './cli/run'

async function main() {
  const args = process.argv.slice(2)

  // Hidden flag: background auto-update (spawned detached, runs silently after main process exits)
  if (args[0] === '--_update-check') {
    const [, serverUrl, binaryPath] = args
    await runBgUpdateCheck(serverUrl, binaryPath)
    return
  }

  // Skip update notice + background check when user runs `envman update`
  if (args[0] !== 'update') {
    showUpdateNoticeFromCache()
    const savedServer = getSavedServerUrl()
    if (savedServer) spawnUpdateCheck(savedServer, '')
  }

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp()
    return
  }
  if (args[0] === '--version' || args[0] === '-v') {
    console.log(VERSION)
    return
  }

  switch (args[0]) {
    case 'login':
      await cmdLogin(args.slice(1))
      return
    case 'logout':
      await cmdLogout()
      return
    case 'whoami':
      await cmdWhoami()
      return
    case 'update':
      await cmdUpdate()
      return
    case 'docs':
      await cmdDocs(args.slice(1))
      return
    case 'run':
      await cmdAlias(args.slice(1))
      return
    case 'pm': {
      const { cmdPm } = await import('./pm/cli/pm-commands')
      await cmdPm(args.slice(1))
      return
    }
    case 'mcp': {
      process.stderr.write(
        '[envman] WARNING: envman mcp is deprecated.\n' +
        '         Use CLI commands directly. Run `envman docs` for full reference.\n\n',
      )
      const { runMcpServer } = await import('./mcp')
      await runMcpServer(args.slice(1))
      return
    }
    case 'daemon-internal': {
      // Hidden subcommand — di-spawn oleh `envman daemon start`.
      // Tidak boleh dipanggil user secara langsung.
      const { runDaemon } = await import('./pm/daemon/main')
      await runDaemon()
      return
    }
  }

  // Run mode — collect all flags before --
  const sepIdx = args.indexOf('--')
  if (sepIdx === -1) {
    console.error('Missing -- separator.\nUsage: envman -e <project:env|file> -- <command>')
    process.exit(1)
  }

  const flagArgs = args.slice(0, sepIdx)
  const command = args.slice(sepIdx + 1)
  const sources: string[] = []
  let serverWins = false
  let i = 0

  while (i < flagArgs.length) {
    const flag = flagArgs[i]
    if (flag === '-e') {
      const val = flagArgs[i + 1]
      if (!val) {
        console.error('-e requires a value')
        process.exit(1)
      }
      sources.push(val)
      i += 2
    } else if (flag === '--server-wins') {
      serverWins = true
      i++
    } else {
      console.error(`Unknown flag: ${flag}\nRun 'envman --help' for usage.`)
      process.exit(1)
    }
  }

  if (sources.length === 0 && !command.some((a) => a.startsWith('files:') || isProjectFileRef(a))) {
    console.error(
      'Specify at least one -e source, or reference a project file directly.\nUsage: envman -e project:env -- command\n       envman -- bash myapp:scripts/deploy.sh',
    )
    process.exit(1)
  }

  await cmdRun(sources, command, serverWins)
}

// Guard with import.meta.main so helpers can be imported in tests without triggering CLI
if (import.meta.main) {
  main().catch((err) => {
    console.error('Fatal:', err.message)
    process.exit(1)
  })
}
