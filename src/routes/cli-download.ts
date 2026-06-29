import { Elysia } from 'elysia'
import { getPublicOrigin } from '../lib/request'
import pkg from '../../package.json'

// CLI download and upload routes: /install, /download/cli/*, /api/admin/cli/upload/*
export const cliDownloadRouter = new Elysia()

  .get('/install', ({ request }) => {
    const origin = getPublicOrigin(request)
    const script = `#!/bin/sh
set -e

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
  x86_64)  ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

case "$OS" in
  linux)  PLATFORM="linux-$ARCH" ;;
  darwin) PLATFORM="darwin-$ARCH" ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

URL="${origin}/download/cli/$PLATFORM"
DEST="\${ENVMAN_DEST:-/usr/local/bin/envman}"
TMP="/tmp/envman-download.$$"

trap 'rm -f "$TMP"' EXIT INT TERM

attempt=1
max_attempts=5
while [ $attempt -le $max_attempts ]; do
  echo "Downloading envman for $PLATFORM... (attempt $attempt/$max_attempts)"
  if curl -fL --compressed --progress-bar --retry 3 --retry-all-errors --retry-delay 2 "$URL" -o "$TMP"; then
    break
  fi
  attempt=$((attempt+1))
  if [ $attempt -le $max_attempts ]; then
    echo "Connection interrupted, retrying in 2s..."
    sleep 2
  fi
done

if [ $attempt -gt $max_attempts ]; then
  echo "Error: Failed to download after $max_attempts attempts"
  exit 1
fi

chmod +x "$TMP"

if [ -w "$(dirname $DEST)" ]; then
  mv "$TMP" "$DEST"
else
  sudo mv "$TMP" "$DEST"
fi

echo "Installed envman to $DEST"
echo "Run: envman login ${origin} --token <your-token>"
`
    return new Response(script, { headers: { 'Content-Type': 'text/plain' } })
  })

  .get('/download/cli/version', () => ({ version: pkg.version as string }))

  .get('/download/cli/:platform', async ({ params, request, set }) => {
    const platforms: Record<string, string> = {
      'linux-x64': 'envman-linux-x64',
      'linux-arm64': 'envman-linux-arm64',
      'darwin-x64': 'envman-darwin-x64',
      'darwin-arm64': 'envman-darwin-arm64',
      'windows-x64': 'envman-windows-x64.exe',
    }
    const filename = platforms[params.platform]
    if (!filename) {
      set.status = 404
      return 'Unknown platform'
    }

    const cliDir = process.env.CLI_DATA_DIR ?? '/data/cli'
    const acceptsGzip = (request.headers.get('accept-encoding') ?? '').toLowerCase().includes('gzip')

    if (acceptsGzip) {
      const gzFile = Bun.file(`${cliDir}/${filename}.gz`)
      if (await gzFile.exists()) {
        set.headers['Content-Type'] = 'application/octet-stream'
        set.headers['Content-Encoding'] = 'gzip'
        set.headers.Vary = 'Accept-Encoding'
        set.headers['Content-Disposition'] = `attachment; filename="${filename}"`
        return gzFile
      }
    }

    const plainFile = Bun.file(`${cliDir}/${filename}`)
    if (await plainFile.exists()) {
      set.headers['Content-Type'] = 'application/octet-stream'
      set.headers.Vary = 'Accept-Encoding'
      set.headers['Content-Disposition'] = `attachment; filename="${filename}"`
      return plainFile
    }

    const repo = process.env.GITHUB_REPO ?? 'bipprojectbali/envman'
    const url = `https://github.com/${repo}/releases/latest/download/${filename}`
    set.status = 302
    set.headers.Location = url
    return null
  })

  // Upload CLI binary from CI — overwrite latest without SSH access to server
  .post('/api/admin/cli/upload/:platform', async ({ params, request, set }) => {
    const secret = request.headers.get('x-cli-upload-secret')
    if (!secret || secret !== process.env.CLI_UPLOAD_SECRET) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
    const platforms: Record<string, string> = {
      'linux-x64': 'envman-linux-x64',
      'linux-arm64': 'envman-linux-arm64',
      'darwin-x64': 'envman-darwin-x64',
      'darwin-arm64': 'envman-darwin-arm64',
      'windows-x64': 'envman-windows-x64.exe',
    }
    const filename = platforms[params.platform]
    if (!filename) {
      set.status = 404
      return { error: 'Unknown platform' }
    }
    const body = await request.arrayBuffer()
    if (body.byteLength === 0) {
      set.status = 400
      return { error: 'Empty body' }
    }
    const cliDir = process.env.CLI_DATA_DIR ?? '/data/cli'
    await Bun.write(`${cliDir}/${filename}.gz`, body)
    return { ok: true, platform: params.platform, size: body.byteLength }
  })
