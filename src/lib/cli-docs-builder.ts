import { buildAuthSection } from './cli-docs/auth'
import { buildInjectSection } from './cli-docs/inject'
import { buildFilesAliasesSection } from './cli-docs/files-aliases'
import { buildStorageSection } from './cli-docs/storage'
import { buildPortainerSection } from './cli-docs/portainer'
import { buildCicdSection } from './cli-docs/cicd'
import { buildTroubleshootSection } from './cli-docs/troubleshoot'

export function buildCliDocsMd(origin: string): string {
  return `# envman CLI — Referensi Lengkap

> Dokumentasi khusus CLI. Untuk referensi API server dan konfigurasi self-hosting, lihat \`${origin}/api/docs.md\`.

${buildAuthSection(origin)}
${buildInjectSection()}
${buildFilesAliasesSection(origin)}
${buildStorageSection()}
${buildPortainerSection()}
${buildCicdSection(origin)}
${buildTroubleshootSection()}
`
}
