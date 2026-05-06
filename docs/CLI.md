# Envman CLI

Standalone CLI for injecting env vars at runtime. Built with `bun build --compile` into self-contained binaries.

- Entry: `src/cli.ts`
- Build: `bun run build:cli` → `dist/cli/envman-{platform}`
- Platforms: `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `windows-x64`
- Served at: `/download/cli/<platform>`

## Auth Resolution (priority: highest → lowest)

1. `ENVMAN_SERVER` + `ENVMAN_TOKEN` in a local `-e` file
2. `ENVMAN_SERVER` + `ENVMAN_TOKEN` as system env vars (process.env / ~/.bashrc / CI)
3. Config file at `~/.config/envman/config.json` (saved by `envman login`)

`ENVMAN_SERVER` and `ENVMAN_TOKEN` are always stripped from the child process env.

## Commands

```bash
envman login <server-url> --token <token>   # Save to ~/.config/envman/config.json
envman logout                                # Remove config file
envman whoami                                # Show authenticated user
envman [options] -- <command>               # Inject vars and run command
```

## Options

```
-e <project>:<env>   Fetch vars from server (contains ":")
-e <file>            Load vars from local file (no ":")
--server-wins        System env takes priority over merged vars (default: merged wins)
```

## Examples

```bash
# Single source
envman -e myapp:production -- bun run start

# Multiple sources (later -e overrides earlier)
envman -e myapp:base -e myapp:production -- bun dev

# Mix local + remote
envman -e .env.local -e myapp:production -- bun dev

# Auth from local file (ENVMAN_SERVER/TOKEN inside .env.local)
envman -e .env.local -e myapp:production -- bun dev
```
