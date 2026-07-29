import { buildAuthSection } from './cli-docs/auth'
import { buildCicdSection } from './cli-docs/cicd'
import { buildClipSection } from './cli-docs/clip'
import { buildEnvSection } from './cli-docs/env'
import { buildFilesAliasesSection } from './cli-docs/files-aliases'
import { buildGistsSection } from './cli-docs/gists'
import { buildHealthSection } from './cli-docs/health'
import { buildInjectSection } from './cli-docs/inject'
import { buildPortainerSection } from './cli-docs/portainer'
import { buildProjectsSection } from './cli-docs/projects'
import { buildStorageSection } from './cli-docs/storage'
import { buildSysSection } from './cli-docs/sys'
import { buildTransferSection } from './cli-docs/transfer'
import { buildTroubleshootSection } from './cli-docs/troubleshoot'

export function buildCliDocsMd(origin: string): string {
  return `# envman CLI — Referensi Lengkap

> Dokumentasi khusus CLI. Untuk referensi API server dan konfigurasi self-hosting, lihat \`${origin}/api/docs.md\`.

${buildAuthSection(origin)}
${buildProjectsSection()}
${buildInjectSection()}
${buildEnvSection()}
${buildClipSection()}
${buildTransferSection()}
${buildGistsSection()}
${buildHealthSection()}
${buildSysSection()}
${buildFilesAliasesSection(origin)}
${buildStorageSection()}
${buildPortainerSection()}
${buildCicdSection(origin)}
${buildTroubleshootSection()}
`
}
