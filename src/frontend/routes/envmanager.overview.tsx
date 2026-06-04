import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Paper,
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
  TbFileCode,
  TbFolders,
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
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
  border-color: var(--mantine-color-primary);
  box-shadow: var(--mantine-shadow-sm);
}
.envman-stat-card.is-clickable:focus-visible,
.envman-overview-row:focus-visible {
  outline: 2px solid var(--mantine-color-primary);
  outline-offset: 2px;
  border-color: var(--mantine-color-primary);
}
`

const envColor = (name: string) => {
  if (name === 'production' || name === 'prod') return 'red'
  if (name === 'staging' || name === 'stg') return 'orange'
  if (name === 'development' || name === 'dev') return 'blue'
  return 'violet'
}

function ProjectInitial({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <Box
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        flexShrink: 0,
        background: 'color-mix(in srgb, var(--mantine-color-blue-5) 25%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text size="xs" fw={800} c="blue" lh={1}>
        {initial}
      </Text>
    </Box>
  )
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

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: 'sm', md: 'md' }}>
        {/* ─── Projects list ──────────────── */}
        <Paper
          p="md"
          style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}
        >
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <ThemeIcon size={24} radius="sm" variant="light" color="primary">
                <TbFolders size={13} />
              </ThemeIcon>
              <Text fw={600} size="sm">
                Projects
              </Text>
              {!loadingProjects && projects.length > 0 && (
                <Badge size="xs" variant="light" color="primary" circle>
                  {projects.length}
                </Badge>
              )}
            </Group>
            <Button
              size="compact-xs"
              variant="subtle"
              color="primary"
              rightSection={<TbArrowRight size={12} />}
              onClick={() => navigate({ to: '/envmanager', search: { create: false, editSlug: undefined } })}
            >
              Lihat semua
            </Button>
          </Group>

          {loadingProjects ? (
            <Stack gap="xs">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={52} radius="md" />
              ))}
            </Stack>
          ) : recentProjects.length === 0 ? (
            <Box
              p="lg"
              ta="center"
              style={{
                border: '1px dashed var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-md)',
              }}
            >
              <Text size="sm" c="dimmed" mb="xs">
                Belum ada project
              </Text>
              <Button
                size="xs"
                leftSection={<TbPlus size={13} />}
                onClick={() => navigate({ to: '/envmanager', search: { create: false, editSlug: undefined } })}
              >
                Buat Project
              </Button>
            </Box>
          ) : (
            <Stack gap={6}>
              {recentProjects.map((p: any) => {
                const envs: any[] = p.environments ?? []
                const goTo = () =>
                  navigate({
                    to: '/envmanager/$slug',
                    params: { slug: p.slug },
                    search: {
                      tab: 'environments',
                      fileId: undefined,
                      fileNew: false,
                      viewFileId: undefined,
                      aliasId: undefined,
                      aliasNew: false,
                      viewAliasId: undefined,
                      noteId: undefined,
                      noteNew: false,
                      viewNoteId: undefined,
                    },
                  })
                return (
                  <Group
                    key={p.slug}
                    justify="space-between"
                    p="sm"
                    gap="sm"
                    className="envman-overview-row"
                    role="link"
                    tabIndex={0}
                    aria-label={`Buka project ${p.name}`}
                    onClick={goTo}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        goTo()
                      }
                    }}
                    style={{
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <Group gap="sm" style={{ flex: 1, minWidth: 0 }} wrap="nowrap">
                      <ProjectInitial name={p.name} />
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Group gap={6} mb={3} wrap="nowrap">
                          <Text
                            size="sm"
                            fw={600}
                            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {p.name}
                          </Text>
                          <Code fz="xs" style={{ flexShrink: 0 }}>
                            {p.slug}
                          </Code>
                        </Group>
                        <Group gap={4} wrap="wrap">
                          {envs.slice(0, 4).map((e: any) => (
                            <Badge key={e.name} size="xs" variant="light" color={envColor(e.name)}>
                              {e.name}
                              {e._count?.vars != null && ` · ${e._count.vars}`}
                            </Badge>
                          ))}
                          {envs.length > 4 && (
                            <Text size="xs" c="dimmed">
                              +{envs.length - 4}
                            </Text>
                          )}
                          {envs.length === 0 && (
                            <Text size="xs" c="dimmed" fs="italic">
                              belum ada env
                            </Text>
                          )}
                        </Group>
                      </Box>
                    </Group>
                    <TbChevronRight size={14} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
                  </Group>
                )
              })}
              {projects.length > 5 && (
                <Text size="xs" c="dimmed" ta="center" mt={2}>
                  +{projects.length - 5} project lainnya
                </Text>
              )}
            </Stack>
          )}
        </Paper>

        {/* ─── Right column ──────────────── */}
        <Stack gap="md">
          {/* Gists */}
          <Paper
            p="md"
            style={{
              borderRadius: 'var(--mantine-radius-md)',
              border: '1px solid var(--mantine-color-default-border)',
            }}
          >
            <Group justify="space-between" mb="md">
              <Group gap="xs">
                <ThemeIcon size={24} radius="sm" variant="light" color="grape">
                  <TbBrandGithub size={13} />
                </ThemeIcon>
                <Text fw={600} size="sm">
                  Gists Terbaru
                </Text>
              </Group>
              <Button
                size="compact-xs"
                variant="subtle"
                color="grape"
                rightSection={<TbArrowRight size={12} />}
                onClick={() => navigate({ to: '/envmanager/gists', search: { gist: undefined, edit: undefined } })}
              >
                Lihat semua
              </Button>
            </Group>

            {loadingGists ? (
              <Stack gap="xs">
                {[1, 2].map((i) => (
                  <Skeleton key={i} height={44} radius="md" />
                ))}
              </Stack>
            ) : gists.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="sm">
                Belum ada gist
              </Text>
            ) : (
              <Stack gap={6}>
                {recentGists.map((g: any) => (
                  <Group
                    key={g.id}
                    justify="space-between"
                    p="xs"
                    gap="sm"
                    className="envman-overview-row"
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate({ to: '/envmanager/gists', search: { gist: g.id, edit: undefined } })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate({ to: '/envmanager/gists', search: { gist: g.id, edit: undefined } })
                      }
                    }}
                    style={{
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <Group gap="xs" style={{ flex: 1, minWidth: 0 }} wrap="nowrap">
                      <TbFileCode size={14} style={{ color: 'var(--mantine-color-grape-5)', flexShrink: 0 }} />
                      <Paper style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          size="xs"
                          fw={600}
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {g.title}
                        </Text>
                        <Group gap={4} mt={2}>
                          <Text size="xs" c="dimmed">
                            {g.files?.length ?? 0} file
                          </Text>
                          <Badge
                            size="xs"
                            variant="light"
                            color={g.isPublic ? 'teal' : 'gray'}
                            leftSection={g.isPublic ? <TbGlobe size={8} /> : <TbLock size={8} />}
                          >
                            {g.isPublic ? 'public' : 'private'}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            {relativeTime(g.updatedAt)}
                          </Text>
                        </Group>
                      </Paper>
                    </Group>
                    <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
                  </Group>
                ))}
                {gists.length > 4 && (
                  <Text size="xs" c="dimmed" ta="center">
                    +{gists.length - 4} gist lainnya
                  </Text>
                )}
              </Stack>
            )}
          </Paper>

          {/* Tokens */}
          <Paper
            p="md"
            style={{
              borderRadius: 'var(--mantine-radius-md)',
              border: '1px solid var(--mantine-color-default-border)',
            }}
          >
            <Group justify="space-between" mb="md">
              <Group gap="xs">
                <ThemeIcon size={24} radius="sm" variant="light" color="orange">
                  <TbKey size={13} />
                </ThemeIcon>
                <Text fw={600} size="sm">
                  API Tokens
                </Text>
              </Group>
              <Button
                size="compact-xs"
                variant="subtle"
                color="orange"
                rightSection={<TbArrowRight size={12} />}
                onClick={() => navigate({ to: '/envmanager/tokens', search: { token: undefined, edit: undefined } })}
              >
                Kelola
              </Button>
            </Group>

            {loadingTokens ? (
              <Stack gap="xs">
                {[1, 2].map((i) => (
                  <Skeleton key={i} height={40} radius="md" />
                ))}
              </Stack>
            ) : tokens.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="sm">
                Belum ada token
              </Text>
            ) : (
              <Stack gap="xs">
                {/* Stats summary */}
                <Group gap="lg">
                  <Group gap={5}>
                    <TbShieldCheck size={13} style={{ color: 'var(--mantine-color-teal-6)' }} />
                    <Text size="xs" fw={600}>
                      {activeTokens.length}
                    </Text>
                    <Text size="xs" c="dimmed">
                      aktif
                    </Text>
                  </Group>
                  <Group gap={5}>
                    <TbLockOpen size={13} style={{ color: 'var(--mantine-color-orange-5)' }} />
                    <Text size="xs" fw={600}>
                      {tokens.filter((t: any) => t.canWrite).length}
                    </Text>
                    <Text size="xs" c="dimmed">
                      read-write
                    </Text>
                  </Group>
                  {tokens.some((t: any) => t.isDisabled) && (
                    <Group gap={5}>
                      <Text size="xs" fw={600} c="dimmed">
                        {tokens.filter((t: any) => t.isDisabled).length}
                      </Text>
                      <Text size="xs" c="dimmed">
                        disabled
                      </Text>
                    </Group>
                  )}
                </Group>

                {recentTokens.length > 0 && (
                  <>
                    <Divider />
                    <Text size="xs" c="dimmed" fw={500}>
                      Terakhir digunakan
                    </Text>
                    {recentTokens.map((t: any) => (
                      <Group key={t.id} justify="space-between">
                        <Group gap={6}>
                          <Badge
                            size="xs"
                            color={t.canWrite ? 'orange' : 'blue'}
                            variant="light"
                            leftSection={t.canWrite ? <TbLockOpen size={9} /> : <TbLock size={9} />}
                          >
                            {t.canWrite ? 'rw' : 'ro'}
                          </Badge>
                          <Text
                            size="xs"
                            fw={500}
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 130,
                            }}
                          >
                            {t.name}
                          </Text>
                        </Group>
                        <Tooltip label={`Terakhir dipakai ${absoluteTime(t.lastUsedAt)}`} withArrow>
                          <Text size="xs" c="dimmed">
                            {relativeTime(t.lastUsedAt)}
                          </Text>
                        </Tooltip>
                      </Group>
                    ))}
                  </>
                )}
              </Stack>
            )}
          </Paper>

          {/* Connections */}
          <Paper
            p="md"
            style={{
              borderRadius: 'var(--mantine-radius-md)',
              border: '1px solid var(--mantine-color-default-border)',
            }}
          >
            <Group justify="space-between" mb="md">
              <Group gap="xs">
                <ThemeIcon size={24} radius="sm" variant="light" color="teal">
                  <TbPlugConnected size={13} />
                </ThemeIcon>
                <Text fw={600} size="sm">
                  Portainer Connections
                </Text>
              </Group>
              <Button
                size="compact-xs"
                variant="subtle"
                color="teal"
                rightSection={<TbArrowRight size={12} />}
                onClick={() =>
                  navigate({ to: '/envmanager/connections', search: { tab: 'connections', connectionForm: undefined } })
                }
              >
                Kelola
              </Button>
            </Group>

            {loadingConnections ? (
              <Skeleton height={40} radius="md" />
            ) : connections.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="sm">
                Belum ada connection
              </Text>
            ) : (
              <Stack gap={6}>
                {connections.map((c: any) => (
                  <Group key={c.id} justify="space-between" align="center">
                    <Group gap={8}>
                      <Box
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--mantine-color-teal-5)',
                          flexShrink: 0,
                        }}
                      />
                      <Text size="xs" fw={500}>
                        {c.name}
                      </Text>
                    </Group>
                    <Badge size="xs" variant="light" color="teal">
                      {c._count?.configs ?? 0} env
                    </Badge>
                  </Group>
                ))}
              </Stack>
            )}
          </Paper>
        </Stack>
      </SimpleGrid>
    </Box>
  )
}
