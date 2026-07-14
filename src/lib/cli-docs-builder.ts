import { buildAuthSection } from './cli-docs/auth'
import { buildCicdSection } from './cli-docs/cicd'
import { buildEnvSection } from './cli-docs/env'
import { buildFilesAliasesSection } from './cli-docs/files-aliases'
import { buildInjectSection } from './cli-docs/inject'
import { buildPortainerSection } from './cli-docs/portainer'
import { buildStorageSection } from './cli-docs/storage'
import { buildTroubleshootSection } from './cli-docs/troubleshoot'

export function buildCliDocsMd(origin: string): string {
  return `# envman CLI — Referensi Lengkap

> Dokumentasi khusus CLI. Untuk referensi API server dan konfigurasi self-hosting, lihat \`${origin}/api/docs.md\`.

${buildAuthSection(origin)}
${buildInjectSection()}
${buildEnvSection()}
${buildFilesAliasesSection(origin)}
${buildStorageSection()}
${buildPortainerSection()}
${buildCicdSection(origin)}
${buildTroubleshootSection()}
`
}
