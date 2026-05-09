import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Divider,
  Group,
  RingProgress,
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
  TbArrowRight,
  TbChevronRight,
  TbClock,
  TbKey,
  TbLock,
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
  return (
    <Card
      withBorder p="md" radius="md"
      style={{
        cursor: onClick ? 'pointer' : undefined,
        transition: 'box-shadow 0.15s, transform 0.15s',
        borderLeft: `3px solid var(--mantine-color-${color}-5)`,
      }}
      onClick={onClick}
      onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--mantine-shadow-sm)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' } }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = ''; (e.currentTarget as HTMLElement).style.transform = '' }}
    >
      <Group justify="space-between" align="flex-start" mb="sm">
        <ThemeIcon size={40} radius="md" variant="light" color={color}>
          <Icon size={20} />
        </ThemeIcon>
        {loading ? (
          <Skeleton height={32} width={48} />
        ) : (
          <Text fw={800} size="xl" lh={1}>{value}</Text>
        )}
      </Group>
      <Text size="sm" fw={600}>{label}</Text>
      {sub && <Text size="xs" c="dimmed" mt={2}>{sub}</Text>}
    </Card>
  )
}

function OverviewPage() {
  const navigate = useNavigate()

  const { data: projectsData, isLoading: loadingProjects, refetch: refetchProjects } = useQuery({
    queryKey: ['envman', 'projects'],
    queryFn: () => apiFetch('/api/envman/projects'),
    refetchInterval: 60_000,
  })

  const { data: tokensData, isLoading: loadingTokens } = useQuery({
    queryKey: ['envman', 'tokens'],
    queryFn: () => apiFetch('/api/envman/tokens'),
    refetchInterval: 60_000,
  })

  const { data: connectionsData, isLoading: loadingConnections } = useQuery({
    queryKey: ['portainer', 'connections'],
    queryFn: () => apiFetch('/api/envman/portainer/connections'),
    refetchInterval: 60_000,
  })

  const projects = projectsData?.projects ?? []
  const tokens = tokensData?.tokens ?? []
  const connections = connectionsData?.connections ?? []

  const totalEnvs = projects.reduce((s: number, p: any) => s + (p._count?.environments ?? 0), 0)
  const totalVars = projects.reduce((s: number, p: any) => s + (p._count?.vars ?? 0), 0)
  const activeTokens = tokens.filter((t: any) => {
    if (t.isDisabled) return false
    if (!t.expiresAt) return true
    return new Date(t.expiresAt) > new Date()
  })
  const secretVarCount = projects.reduce((s: number, p: any) => s + (p._count?.secrets ?? 0), 0)

  // Recent projects (sorted by updatedAt if available, otherwise take first 5)
  const recentProjects = [...projects].slice(0, 5)

  // Active tokens sorted by last used
  const recentTokens = [...tokens]
    .filter((t: any) => t.lastUsedAt)
    .sort((a: any, b: any) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
    .slice(0, 3)

  const isLoading = loadingProjects || loadingTokens || loadingConnections

  return (
    <Box>
      {/* ─── Header ─────────────────────── */}
      <Group justify="space-between" mb="xl">
        <Box>
          <Text fw={700} size="lg">Overview</Text>
          <Text size="sm" c="dimmed">Ringkasan seluruh environment variables yang kamu kelola</Text>
        </Box>
        <Tooltip label="Refresh">
          <ActionIcon variant="subtle" color="gray" loading={isLoading} onClick={() => refetchProjects()}>
            <TbRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* ─── Stats cards ────────────────── */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="xl">
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
          label="API Tokens"
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
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">

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
                return (
                  <Group
                    key={p.slug}
                    justify="space-between"
                    p="sm"
                    style={{ borderRadius: 8, border: '1px solid var(--mantine-color-default-border)', cursor: 'pointer' }}
                    onClick={() => navigate({ to: '/envmanager/$slug', params: { slug: p.slug }, search: { tab: 'environments' } })}
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
                {/* Summary row */}
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

                {/* Recently used */}
                {recentTokens.length > 0 && (
                  <>
                    <Text size="xs" c="dimmed" fw={500}>Terakhir digunakan</Text>
                    {recentTokens.map((t: any) => (
                      <Group key={t.id} justify="space-between" px="xs">
                        <Group gap="xs">
                          <Badge size="xs" color={t.canWrite ? 'orange' : 'blue'} variant="light">
                            {t.canWrite ? 'rw' : 'ro'}
                          </Badge>
                          <Text size="xs" fw={500}>{t.name}</Text>
                        </Group>
                        <Group gap="xs">
                          <TbClock size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
                          <Text size="xs" c="dimmed">{relativeTime(t.lastUsedAt)}</Text>
                        </Group>
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
