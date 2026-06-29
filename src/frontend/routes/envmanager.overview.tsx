import {
  ActionIcon,
  Alert,
  Box,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  TbAlertTriangle,
  TbBrandGithub,
  TbChevronRight,
  TbKey,
  TbNote,
  TbPlugConnected,
  TbRefresh,
  TbVariable,
} from 'react-icons/tb'
import { OverviewDataPanels } from '@/frontend/components/overview/OverviewDataPanels'
import { apiFetch } from '@/frontend/lib/api'
import { HOVER_STYLES, absoluteTime, relativeTime } from '@/frontend/lib/overview-utils'

export const Route = createFileRoute('/envmanager/overview')({
  component: OverviewPage,
})

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  loading,
  onClick,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color: string
  loading?: boolean
  onClick?: () => void
}) {
  const clickable = !!onClick
  return (
    <Paper
      p={{ base: 'sm', sm: 'md' }}
      className={`envman-stat-card ${clickable ? 'is-clickable' : ''}`}
      role={clickable ? 'link' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Buka ${label}` : undefined}
      onClick={onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px solid var(--mantine-color-default-border)',
        cursor: clickable ? 'pointer' : undefined,
      }}
    >
      <Group justify="space-between" align="center" mb={8}>
        <ThemeIcon size={32} radius="md" variant="light" color={color}>
          <Icon size={16} />
        </ThemeIcon>
        {clickable && <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)' }} />}
      </Group>
      {loading ? (
        <Skeleton height={26} width={48} mb={4} />
      ) : (
        <Text fw={800} size="xl" lh={1} mb={4}>
          {value}
        </Text>
      )}
      <Text size="xs" fw={600} c="dimmed">
        {label}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed" mt={2} lineClamp={1}>
          {sub}
        </Text>
      )}
    </Paper>
  )
}

function OverviewPage() {
  const navigate = useNavigate()

  const {
    data: projectsData,
    isLoading: loadingProjects,
    isError: errorProjects,
    refetch: refetchProjects,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['envman', 'projects'],
    queryFn: () => apiFetch('/api/envman/projects'),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  })

  const { data: tokensData, isLoading: loadingTokens } = useQuery({
    queryKey: ['envman', 'tokens'],
    queryFn: () => apiFetch('/api/envman/tokens'),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  })

  const { data: connectionsData, isLoading: loadingConnections } = useQuery({
    queryKey: ['portainer', 'connections'],
    queryFn: () => apiFetch('/api/envman/portainer/connections'),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  })

  const { data: gistsData, isLoading: loadingGists } = useQuery({
    queryKey: ['envman', 'gists'],
    queryFn: () => apiFetch('/api/envman/gists'),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  })

  const projects = projectsData?.projects ?? []
  const tokens = tokensData?.tokens ?? []
  const connections = connectionsData?.connections ?? []
  const gists: any[] = gistsData?.gists ?? []

  const totalEnvs = projects.reduce((s: number, p: any) => s + (p._count?.environments ?? 0), 0)
  const totalVars = projects.reduce((s: number, p: any) => s + (p._count?.vars ?? 0), 0)
  const activeTokens = tokens.filter((t: any) => {
    if (t.isDisabled) return false
    if (!t.expiresAt) return true
    return new Date(t.expiresAt) > new Date()
  })
  const secretVarCount = projects.reduce((s: number, p: any) => s + (p._count?.secrets ?? 0), 0)
  const publicGists = gists.filter((g: any) => g.isPublic)

  const recentProjects = [...projects].slice(0, 5)
  const recentTokens = [...tokens]
    .filter((t: any) => t.lastUsedAt)
    .sort((a: any, b: any) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
    .slice(0, 3)
  const recentGists = [...gists]
    .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4)

  const isLoading = loadingProjects || loadingTokens || loadingConnections || loadingGists

  return (
    <Box>
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS for hover */}
      <style dangerouslySetInnerHTML={{ __html: HOVER_STYLES }} />

      {/* ─── Header ─────────────────────── */}
      <Group justify="space-between" mb={{ base: 'md', sm: 'xl' }} wrap="nowrap" align="center">
        <Box>
          <Text fw={800} size="xl" lh={1.2}>
            Overview
          </Text>
          {dataUpdatedAt > 0 && (
            <Tooltip label={`Diperbarui ${absoluteTime(new Date(dataUpdatedAt).toISOString())}`} withArrow>
              <Text size="xs" c="dimmed" mt={2} style={{ cursor: 'default' }}>
                Diperbarui {relativeTime(new Date(dataUpdatedAt).toISOString())}
              </Text>
            </Tooltip>
          )}
        </Box>
        <Tooltip label="Refresh data" withArrow>
          <ActionIcon
            size="md"
            variant="default"
            radius="md"
            aria-label="Refresh data"
            loading={isLoading}
            onClick={() => refetchProjects()}
          >
            <TbRefresh size={15} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {errorProjects && (
        <Alert
          color="red"
          icon={<TbAlertTriangle size={14} />}
          mb="md"
          withCloseButton
          onClose={() => refetchProjects()}
        >
          <Text size="xs">
            Gagal memuat data project.{' '}
            <Text component="span" td="underline" style={{ cursor: 'pointer' }} onClick={() => refetchProjects()}>
              Coba lagi
            </Text>
          </Text>
        </Alert>
      )}

      {/* ─── Stats cards ────────────────── */}
      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing={{ base: 'xs', sm: 'sm' }} mb={{ base: 'md', sm: 'xl' }}>
        <StatCard
          icon={TbVariable}
          label="Projects"
          value={projects.length}
          sub={`${totalEnvs} environment`}
          color="primary"
          loading={loadingProjects}
          onClick={() => navigate({ to: '/envmanager', search: { create: false, editSlug: undefined } })}
        />
        <StatCard
          icon={TbVariable}
          label="Variables"
          value={totalVars}
          sub={secretVarCount > 0 ? `${secretVarCount} secret` : 'semua plain'}
          color="blue"
          loading={loadingProjects}
        />
        <StatCard
          icon={TbKey}
          label="Tokens"
          value={activeTokens.length}
          sub={tokens.length > activeTokens.length ? `${tokens.length - activeTokens.length} inactive` : 'semua aktif'}
          color="orange"
          loading={loadingTokens}
          onClick={() => navigate({ to: '/envmanager/tokens', search: { token: undefined, edit: undefined } })}
        />
        <StatCard
          icon={TbPlugConnected}
          label="Connections"
          value={connections.length}
          sub="Portainer instance"
          color="teal"
          loading={loadingConnections}
          onClick={() =>
            navigate({ to: '/envmanager/connections', search: { tab: 'connections', connectionForm: undefined } })
          }
        />
        <StatCard
          icon={TbBrandGithub}
          label="Gists"
          value={gists.length}
          sub={publicGists.length > 0 ? `${publicGists.length} public` : 'semua private'}
          color="grape"
          loading={loadingGists}
          onClick={() => navigate({ to: '/envmanager/gists', search: { gist: undefined, edit: undefined } })}
        />
        <StatCard
          icon={TbNote}
          label="Notes"
          value={projects.reduce((s: number, p: any) => s + (p._count?.notes ?? 0), 0)}
          sub="di semua project"
          color="pink"
          loading={loadingProjects}
        />
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
