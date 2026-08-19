import { buildIntroSection } from './docs-sections/intro'
import { buildCliSection } from './docs-sections/cli'
import { buildApiCoreSection } from './docs-sections/api-core'
import { buildApiTokensPortainerSection } from './docs-sections/api-tokens-portainer'
import { buildApiGistsTicketsSection } from './docs-sections/api-gists-tickets'
import { buildApiStorageSection } from './docs-sections/api-storage'
import { buildApiTransferSection } from './docs-sections/api-transfer'
import { buildApiEnvImportsSection } from './docs-sections/api-env-imports'
import { buildConceptsSection } from './docs-sections/concepts'
import { buildDatabaseSection } from './docs-sections/database'
import { buildSelfHostingSection } from './docs-sections/self-hosting'

export function buildDocsMarkdown(origin: string): string {
  return (
    buildIntroSection(origin) +
    buildCliSection(origin) +
    buildApiCoreSection(origin) +
    buildApiTokensPortainerSection(origin) +
    buildApiGistsTicketsSection(origin) +
    buildApiStorageSection(origin) +
    buildApiTransferSection(origin) +
    buildApiEnvImportsSection(origin) +
    buildConceptsSection() +
    buildDatabaseSection() +
    buildSelfHostingSection(origin)
  )
}
