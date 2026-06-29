import {
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
import { useNavigate } from '@tanstack/react-router'
import {
  TbArrowRight,
  TbBrandGithub,
  TbChevronRight,
  TbFileCode,
  TbFolders,
  TbGlobe,
  TbKey,
  TbLock,
  TbLockOpen,
  TbPlus,
  TbPlugConnected,
  TbShieldCheck,
} from 'react-icons/tb'
import { absoluteTime, envColor, ProjectInitial, relativeTime } from '@/frontend/lib/overview-utils'

interface Props {
  projects: any[]
  recentProjects: any[]
  loadingProjects: boolean
  gists: any[]
  recentGists: any[]
  loadingGists: boolean
  tokens: any[]
  activeTokens: any[]
  recentTokens: any[]
  loadingTokens: boolean
  connections: any[]
  loadingConnections: boolean
}

export function OverviewDataPanels({
  projects,
  recentProjects,
  loadingProjects,
  gists,
  recentGists,
  loadingGists,
  tokens,
  activeTokens,
  recentTokens,
  loadingTokens,
  connections,
  loadingConnections,
}: Props) {
  const navigate = useNavigate()

  return (
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
                  style={{ borderRadius: 8, cursor: 'pointer' }}
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
                  style={{ borderRadius: 8, cursor: 'pointer' }}
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
  )
}
