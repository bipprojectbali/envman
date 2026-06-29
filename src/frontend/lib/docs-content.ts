import { buildIntroSection } from './docs-sections/intro'
import { buildCliSection } from './docs-sections/cli'
import { buildApiCoreSection } from './docs-sections/api-core'
import { buildApiTokensPortainerSection } from './docs-sections/api-tokens-portainer'
import { buildApiGistsTicketsSection } from './docs-sections/api-gists-tickets'
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
    buildConceptsSection() +
    buildDatabaseSection() +
    buildSelfHostingSection(origin)
  )
}
