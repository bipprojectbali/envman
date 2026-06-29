import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import {
  TbArrowRight,
  TbBrandGithub,
  TbChevronRight,
  TbFileCode,
  TbGlobe,
  TbLock,
  TbPlugConnected,
} from 'react-icons/tb'
import { OverviewProjectsPanel } from '@/frontend/components/overview/OverviewProjectsPanel'
import { OverviewTokensPanel } from '@/frontend/components/overview/OverviewTokensPanel'
import { relativeTime } from '@/frontend/lib/overview-utils'

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
      <OverviewProjectsPanel projects={projects} recentProjects={recentProjects} loadingProjects={loadingProjects} />

      {/* ─── Right column ──────────────── */}
      <Stack gap="md">
        {/* Gists */}
        <Paper
          p="md"
          style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}
        >
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <ThemeIcon size={24} radius="sm" variant="light" color="grape">
                <TbBrandGithub size={13} />
              </ThemeIcon>
              <Text fw={600} size="sm">Gists Terbaru</Text>
            </Group>
            <Button
              size="compact-xs" variant="subtle" color="grape" rightSection={<TbArrowRight size={12} />}
              onClick={() => navigate({ to: '/envmanager/gists', search: { gist: undefined, edit: undefined } })}
            >
              Lihat semua
            </Button>
          </Group>

          {loadingGists ? (
            <Stack gap="xs">
              {[1, 2].map((i) => <Skeleton key={i} height={44} radius="md" />)}
            </Stack>
          ) : gists.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py="sm">Belum ada gist</Text>
          ) : (
            <Stack gap={6}>
              {recentGists.map((g: any) => (
                <Group
                  key={g.id}
                  justify="space-between" p="xs" gap="sm"
                  className="envman-overview-row"
                  role="link" tabIndex={0}
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
                      <Text size="xs" fw={600} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.title}
                      </Text>
                      <Group gap={4} mt={2}>
                        <Text size="xs" c="dimmed">{g.files?.length ?? 0} file</Text>
                        <Badge
                          size="xs" variant="light" color={g.isPublic ? 'teal' : 'gray'}
                          leftSection={g.isPublic ? <TbGlobe size={8} /> : <TbLock size={8} />}
                        >
                          {g.isPublic ? 'public' : 'private'}
                        </Badge>
                        <Text size="xs" c="dimmed">{relativeTime(g.updatedAt)}</Text>
                      </Group>
                    </Paper>
                  </Group>
                  <TbChevronRight size={12} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
                </Group>
              ))}
              {gists.length > 4 && (
                <Text size="xs" c="dimmed" ta="center">+{gists.length - 4} gist lainnya</Text>
              )}
            </Stack>
          )}
        </Paper>

        <OverviewTokensPanel
          tokens={tokens} activeTokens={activeTokens}
          recentTokens={recentTokens} loadingTokens={loadingTokens}
        />

        {/* Connections */}
        <Paper
          p="md"
          style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}
        >
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <ThemeIcon size={24} radius="sm" variant="light" color="teal">
                <TbPlugConnected size={13} />
              </ThemeIcon>
              <Text fw={600} size="sm">Portainer Connections</Text>
            </Group>
            <Button
              size="compact-xs" variant="subtle" color="teal" rightSection={<TbArrowRight size={12} />}
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
            <Text size="xs" c="dimmed" ta="center" py="sm">Belum ada connection</Text>
          ) : (
            <Stack gap={6}>
              {connections.map((c: any) => (
                <Group key={c.id} justify="space-between" align="center">
                  <Group gap={8}>
                    <Box
                      style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mantine-color-teal-5)', flexShrink: 0 }}
                    />
                    <Text size="xs" fw={500}>{c.name}</Text>
                  </Group>
                  <Badge size="xs" variant="light" color="teal">{c._count?.configs ?? 0} env</Badge>
                </Group>
              ))}
            </Stack>
          )}
        </Paper>
      </Stack>
    </SimpleGrid>
  )
}
