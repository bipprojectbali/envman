import { ActionIcon, Alert, Box, Group, SimpleGrid, Text, Tooltip } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  TbAlertTriangle,
  TbBrandGithub,
  TbKey,
  TbNote,
  TbPlugConnected,
  TbRefresh,
  TbVariable,
} from 'react-icons/tb'
import { OverviewDataPanels } from '@/frontend/components/overview/OverviewDataPanels'
import { OverviewStatCard } from '@/frontend/components/overview/OverviewStatCard'
import { useOverviewData } from '@/frontend/hooks/useOverviewData'
import { HOVER_STYLES, absoluteTime, relativeTime } from '@/frontend/lib/overview-utils'

export const Route = createFileRoute('/envmanager/overview')({ component: OverviewPage })

function OverviewPage() {
  const navigate = useNavigate()
  const {
    projects, tokens, connections, gists,
    totalEnvs, totalVars, activeTokens, secretVarCount, publicGists,
    recentProjects, recentTokens, recentGists, isLoading,
    loadingProjects, loadingTokens, loadingConnections, loadingGists,
    errorProjects, refetchProjects, dataUpdatedAt,
  } = useOverviewData()

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      <Group justify="space-between" mb={{ base: 'md', sm: 'xl' }} wrap="nowrap" align="center">
        <Box>
          <Text fw={800} size="xl" lh={1.2}>Overview</Text>
          {dataUpdatedAt > 0 && (
            <Tooltip label={`Diperbarui ${absoluteTime(new Date(dataUpdatedAt).toISOString())}`} withArrow>
              <Text size="xs" c="dimmed" mt={2} style={{ cursor: 'default' }}>
                Diperbarui {relativeTime(new Date(dataUpdatedAt).toISOString())}
              </Text>
            </Tooltip>
          )}
        </Box>
        <Tooltip label="Refresh data" withArrow>
          <ActionIcon size="md" variant="default" radius="md" aria-label="Refresh data" loading={isLoading} onClick={() => refetchProjects()}>
            <TbRefresh size={15} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {errorProjects && (
        <Alert color="red" icon={<TbAlertTriangle size={14} />} mb="md" withCloseButton onClose={() => refetchProjects()}>
          <Text size="xs">
            Gagal memuat data project.{' '}
            <Text component="span" td="underline" style={{ cursor: 'pointer' }} onClick={() => refetchProjects()}>Coba lagi</Text>
          </Text>
        </Alert>
      )}

      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing={{ base: 'xs', sm: 'sm' }} mb={{ base: 'md', sm: 'xl' }}>
        <OverviewStatCard icon={TbVariable} label="Projects" value={projects.length} sub={`${totalEnvs} environment`} color="primary" loading={loadingProjects} onClick={() => navigate({ to: '/envmanager', search: { create: false, editSlug: undefined } })} />
        <OverviewStatCard icon={TbVariable} label="Variables" value={totalVars} sub={secretVarCount > 0 ? `${secretVarCount} secret` : 'semua plain'} color="blue" loading={loadingProjects} />
        <OverviewStatCard icon={TbKey} label="Tokens" value={activeTokens.length} sub={tokens.length > activeTokens.length ? `${tokens.length - activeTokens.length} inactive` : 'semua aktif'} color="orange" loading={loadingTokens} onClick={() => navigate({ to: '/envmanager/tokens', search: { token: undefined, edit: undefined } })} />
        <OverviewStatCard icon={TbPlugConnected} label="Connections" value={connections.length} sub="Portainer instance" color="teal" loading={loadingConnections} onClick={() => navigate({ to: '/envmanager/connections', search: { tab: 'connections', connectionForm: undefined } })} />
        <OverviewStatCard icon={TbBrandGithub} label="Gists" value={gists.length} sub={publicGists.length > 0 ? `${publicGists.length} public` : 'semua private'} color="grape" loading={loadingGists} onClick={() => navigate({ to: '/envmanager/gists', search: { gist: undefined, edit: undefined } })} />
        <OverviewStatCard icon={TbNote} label="Notes" value={projects.reduce((s: number, p: any) => s + (p._count?.notes ?? 0), 0)} sub="di semua project" color="pink" loading={loadingProjects} />
      </SimpleGrid>

      <OverviewDataPanels
        projects={projects}
        recentProjects={recentProjects}
        loadingProjects={loadingProjects}
        gists={gists}
        recentGists={recentGists}
        loadingGists={loadingGists}
        tokens={tokens}
        activeTokens={activeTokens}
        recentTokens={recentTokens}
        loadingTokens={loadingTokens}
        connections={connections}
        loadingConnections={loadingConnections}
      />
    </Box>
  )
}
