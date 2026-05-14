import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  TbAlertTriangle,
  TbArrowRight,
  TbBrandGithub,
  TbChevronRight,
  TbClock,
  TbDashboard,
  TbFileCode,
  TbGlobe,
  TbKey,
  TbLock,
  TbLockOpen,
  TbNote,
  TbPlugConnected,
  TbPlus,
  TbRefresh,
  TbShieldCheck,
  TbVariable,
} from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'

export const Route = createFileRoute('/envmanager/overview')({
  component: OverviewPage,
})

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} hari lalu`
  return new Date(dateStr).toLocaleDateString('id-ID')
}

function absoluteTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const HOVER_STYLES = `
.envman-stat-card,
.envman-overview-row {
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.15s ease;
}
.envman-stat-card.is-clickable:hover,
.envman-overview-row:hover {
  transform: translateY(-1px);
  border-color: var(--mantine-color-violet-5);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-stat-card.is-clickable:focus-visible,
.envman-overview-row:focus-visible {
  outline: 2px solid var(--mantine-color-violet-5);
  outline-offset: 2px;
  border-color: var(--mantine-color-violet-5);
}
`

const envColor = (name: string) => {
  if (name === 'production' || name === 'prod') return 'red'
  if (name === 'staging' || name === 'stg') return 'orange'
  if (name === 'development' || name === 'dev') return 'blue'
  return 'violet'
}

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
    <Card
      withBorder
      p={{ base: 'sm', sm: 'md' }}
      radius="md"
      className={`envman-stat-card ${clickable ? 'is-clickable' : ''}`}
      role={clickable ? 'link' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Buka ${label}` : undefined}
      onClick={onClick}
      onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } } : undefined}
      style={{
        cursor: clickable ? 'pointer' : undefined,
        borderLeft: `3px solid var(--mantine-color-${color}-5)`,
      }}
    >
      <Group justify="space-between" align="flex-start" mb={{ base: 6, sm: 'sm' }}>
        <ThemeIcon size={36} radius="md" variant="light" color={color}>
          <Icon size={18} />
        </ThemeIcon>
        {loading ? (
          <Skeleton height={28} width={40} />
        ) : (
          <Text fw={800} size="xl" lh={1}>{value}</Text>
        )}
      </Group>
      <Group justify="space-between" align="center">
        <Text size="sm" fw={600}>{label}</Text>
        {clickable && <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)' }} />}
      </Group>
      {sub && <Text size="xs" c="dimmed" mt={2} lineClamp={1}>{sub}</Text>}
    </Card>
  )
}

function OverviewPage() {
  const navigate = useNavigate()

  const { data: projectsData, isLoading: loadingProjects, isError: errorProjects, refetch: refetchProjects, dataUpdatedAt } = useQuery({
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
      <Group justify="space-between" mb={{ base: 'md', sm: 'xl' }} wrap="nowrap" align="flex-start">
        <Group gap="sm" style={{ minWidth: 0 }}>
          <ThemeIcon size={38} radius="md" variant="light" color="violet">
            <TbDashboard size={20} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} size="lg" lh={1.2}>Overview</Text>
            <Tooltip label={dataUpdatedAt ? `Diperbarui ${absoluteTime(new Date(dataUpdatedAt).toISOString())}` : 'Ringkasan seluruh resources'}>
              <Text size="xs" c="dimmed">
                Ringkasan seluruh resources yang kamu kelola
                {dataUpdatedAt > 0 && <> · {relativeTime(new Date(dataUpdatedAt).toISOString())}</>}
              </Text>
            </Tooltip>
          </Box>
        </Group>
        <Tooltip label="Refresh data">
          <ActionIcon
            size="lg"
            variant="default"
            aria-label="Refresh data"
            loading={isLoading}
            onClick={() => refetchProjects()}
          >
            <TbRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {errorProjects && (
        <Alert color="red" icon={<TbAlertTriangle size={14} />} mb="md" withCloseButton onClose={() => refetchProjects()}>
          <Text size="xs">Gagal memuat data project. <Text component="span" td="underline" style={{ cursor: 'pointer' }} onClick={() => refetchProjects()}>Coba lagi</Text></Text>
        </Alert>
      )}

      {/* ─── Stats cards ────────────────── */}
      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing={{ base: 'xs', sm: 'sm' }} mb={{ base: 'md', sm: 'xl' }}>
        <StatCard
          icon={TbVariable}
          label="Projects"
          value={projects.length}
          sub={`${totalEnvs} environment`}
          color="violet"
          loading={loadingProjects}
          onClick={() => navigate({ to: '/envmanager' })}
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
          onClick={() => navigate({ to: '/envmanager/tokens' })}
        />
        <StatCard
          icon={TbPlugConnected}
          label="Connections"
          value={connections.length}
          sub="Portainer instance"
          color="teal"
          loading={loadingConnections}
          onClick={() => navigate({ to: '/envmanager/connections' })}
        />
        <StatCard
          icon={TbBrandGithub}
          label="Gists"
          value={gists.length}
          sub={publicGists.length > 0 ? `${publicGists.length} public` : 'semua private'}
          color="grape"
          loading={loadingGists}
          onClick={() => navigate({ to: '/envmanager/gists' })}
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

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: 'sm', md: 'md' }}>

        {/* ─── Projects list ──────────────── */}
        <Card withBorder p="md">
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <ThemeIcon size={24} radius="sm" variant="light" color="violet">
                <TbVariable size={13} />
              </ThemeIcon>
              <Text fw={600} size="sm">Projects</Text>
            </Group>
            <Button
              size="compact-xs"
              variant="subtle"
              color="violet"
              rightSection={<TbArrowRight size={12} />}
              onClick={() => navigate({ to: '/envmanager' })}
            >
              Lihat semua
            </Button>
          </Group>

          {loadingProjects ? (
            <Stack gap="xs">
              {[1, 2, 3].map(i => <Skeleton key={i} height={52} radius="md" />)}
            </Stack>
          ) : recentProjects.length === 0 ? (
            <Card withBorder p="lg" ta="center" style={{ borderStyle: 'dashed' }}>
              <Text size="sm" c="dimmed" mb="xs">Belum ada project</Text>
              <Button size="xs" leftSection={<TbPlus size={13} />} onClick={() => navigate({ to: '/envmanager' })}>
                Buat Project
              </Button>
            </Card>
          ) : (
            <Stack gap="xs">
              {recentProjects.map((p: any) => {
                const envs: any[] = p.environments ?? []
                const goTo = () => navigate({ to: '/envmanager/$slug', params: { slug: p.slug }, search: { tab: 'environments' } })
                return (
                  <Group
                    key={p.slug}
                    justify="space-between"
                    p="sm"
                    className="envman-overview-row"
                    role="link"
                    tabIndex={0}
                    aria-label={`Buka project ${p.name}`}
                    onClick={goTo}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo() } }}
                    style={{ borderRadius: 8, border: '1px solid var(--mantine-color-default-border)', cursor: 'pointer' }}
                  >
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs" mb={4}>
                        <Text size="sm" fw={600} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </Text>
                        <Code fz="xs" c="dimmed">{p.slug}</Code>
                      </Group>
                      <Group gap={4} wrap="wrap">
                        {envs.slice(0, 4).map((e: any) => (
                          <Badge key={e.name} size="xs" variant="dot" color={envColor(e.name)}>
                            {e.name}
                            {e._count?.vars != null && <Text span c="dimmed"> · {e._count.vars}</Text>}
                          </Badge>
                        ))}
                        {envs.length > 4 && <Text size="xs" c="dimmed">+{envs.length - 4}</Text>}
                        {envs.length === 0 && <Text size="xs" c="dimmed">belum ada environment</Text>}
                      </Group>
                    </Box>
                    <TbChevronRight size={14} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
                  </Group>
                )
              })}
              {projects.length > 5 && (
                <Text size="xs" c="dimmed" ta="center" mt={4}>
                  +{projects.length - 5} project lainnya
                </Text>
              )}
            </Stack>
          )}
        </Card>

        {/* ─── Right column ──────────────── */}
        <Stack gap="md">

          {/* Gists */}
          <Card withBorder p="md">
            <Group justify="space-between" mb="md">
              <Group gap="xs">
                <ThemeIcon size={24} radius="sm" variant="light" color="grape">
                  <TbBrandGithub size={13} />
                </ThemeIcon>
                <Text fw={600} size="sm">Gists Terbaru</Text>
              </Group>
              <Button
                size="compact-xs"
                variant="subtle"
                color="grape"
                rightSection={<TbArrowRight size={12} />}
                onClick={() => navigate({ to: '/envmanager/gists' })}
              >
                Lihat semua
              </Button>
            </Group>

            {loadingGists ? (
              <Stack gap="xs">{[1, 2].map(i => <Skeleton key={i} height={44} radius="md" />)}</Stack>
            ) : gists.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="sm">Belum ada gist</Text>
            ) : (
              <Stack gap="xs">
                {recentGists.map((g: any) => (
                  <Group
                    key={g.id}
                    justify="space-between"
                    p="xs"
                    className="envman-overview-row"
                    role="link"
                    tabIndex={0}
                    aria-label={`Buka gist ${g.title}`}
                    onClick={() => navigate({ to: '/envmanager/gists' })}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate({ to: '/envmanager/gists' }) } }}
                    style={{ borderRadius: 8, border: '1px solid var(--mantine-color-default-border)', cursor: 'pointer' }}
                  >
                    <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                      <TbFileCode size={14} style={{ color: 'var(--mantine-color-grape-5)', flexShrink: 0 }} />
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="xs" fw={600} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {g.title}
                        </Text>
                        <Group gap={4}>
                          <Text size="xs" c="dimmed">{g.files?.length ?? 0} file</Text>
                          {g.isPublic
                            ? <Badge size="xs" variant="dot" color="teal" leftSection={<TbGlobe size={8} />}>public</Badge>
                            : <Badge size="xs" variant="dot" color="gray" leftSection={<TbLock size={8} />}>private</Badge>
                          }
                          <Text size="xs" c="dimmed">{relativeTime(g.updatedAt)}</Text>
                        </Group>
                      </Box>
                    </Group>
                  </Group>
                ))}
                {gists.length > 4 && (
                  <Text size="xs" c="dimmed" ta="center">+{gists.length - 4} gist lainnya</Text>
                )}
              </Stack>
            )}
          </Card>

          {/* Tokens */}
          <Card withBorder p="md">
            <Group justify="space-between" mb="md">
              <Group gap="xs">
                <ThemeIcon size={24} radius="sm" variant="light" color="orange">
                  <TbKey size={13} />
                </ThemeIcon>
                <Text fw={600} size="sm">API Tokens</Text>
              </Group>
              <Button
                size="compact-xs"
                variant="subtle"
                color="orange"
                rightSection={<TbArrowRight size={12} />}
                onClick={() => navigate({ to: '/envmanager/tokens' })}
              >
                Kelola
              </Button>
            </Group>

            {loadingTokens ? (
              <Stack gap="xs">{[1, 2].map(i => <Skeleton key={i} height={40} radius="md" />)}</Stack>
            ) : tokens.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="sm">Belum ada token</Text>
            ) : (
              <Stack gap="xs">
                <Group gap="md" p="xs" style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 8 }}>
                  <Group gap="xs">
                    <TbShieldCheck size={13} style={{ color: 'var(--mantine-color-teal-6)' }} />
                    <Text size="xs">{activeTokens.length} aktif</Text>
                  </Group>
                  <Group gap="xs">
                    <TbLock size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
                    <Text size="xs">{tokens.filter((t: any) => t.canWrite).length} read-write</Text>
                  </Group>
                  {tokens.some((t: any) => t.isDisabled) && (
                    <Text size="xs" c="dimmed">{tokens.filter((t: any) => t.isDisabled).length} disabled</Text>
                  )}
                </Group>
                {recentTokens.length > 0 && (
                  <>
                    <Text size="xs" c="dimmed" fw={500}>Terakhir digunakan</Text>
                    {recentTokens.map((t: any) => (
                      <Group key={t.id} justify="space-between" px="xs">
                        <Group gap="xs">
                          <Tooltip label={t.canWrite ? 'Read-write' : 'Read-only'}>
                            <Badge size="xs" color={t.canWrite ? 'orange' : 'blue'} variant="light" leftSection={t.canWrite ? <TbLockOpen size={9} /> : <TbLock size={9} />}>
                              {t.canWrite ? 'rw' : 'ro'}
                            </Badge>
                          </Tooltip>
                          <Text size="xs" fw={500} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{t.name}</Text>
                        </Group>
                        <Tooltip label={`Terakhir dipakai ${absoluteTime(t.lastUsedAt)}`}>
                          <Group gap="xs">
                            <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                            <Text size="xs" c="dimmed">{relativeTime(t.lastUsedAt)}</Text>
                          </Group>
                        </Tooltip>
                      </Group>
                    ))}
                  </>
                )}
              </Stack>
            )}
          </Card>

          {/* Connections */}
          <Card withBorder p="md">
            <Group justify="space-between" mb="md">
              <Group gap="xs">
                <ThemeIcon size={24} radius="sm" variant="light" color="teal">
                  <TbPlugConnected size={13} />
                </ThemeIcon>
                <Text fw={600} size="sm">Portainer Connections</Text>
              </Group>
              <Button
                size="compact-xs"
                variant="subtle"
                color="teal"
                rightSection={<TbArrowRight size={12} />}
                onClick={() => navigate({ to: '/envmanager/connections' })}
              >
                Kelola
              </Button>
            </Group>

            {loadingConnections ? (
              <Skeleton height={40} radius="md" />
            ) : connections.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="sm">Belum ada connection</Text>
            ) : (
              <Stack gap="xs">
                {connections.map((c: any) => (
                  <Group key={c.id} justify="space-between" px="xs">
                    <Group gap="xs">
                      <ThemeIcon size={20} radius="sm" variant="light" color="teal">
                        <TbPlugConnected size={11} />
                      </ThemeIcon>
                      <Text size="xs" fw={500}>{c.name}</Text>
                    </Group>
                    <Badge size="xs" variant="outline" color="gray">{c._count?.configs ?? 0} env</Badge>
                  </Group>
                ))}
              </Stack>
            )}
          </Card>

        </Stack>
      </SimpleGrid>
    </Box>
  )
}
