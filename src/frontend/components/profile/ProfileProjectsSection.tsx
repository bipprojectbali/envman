import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Card,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  TbAlertCircle,
  TbExternalLink,
  TbFolders,
  TbLayoutGrid,
  TbLayoutList,
  TbLock,
  TbSearch,
  TbX,
} from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'

type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER'

interface Project {
  id: string
  slug: string
  name: string
  description: string | null
  tags: string[]
  myRole: ProjectRole
  environments: { name: string }[]
  _count: { environments: number }
}

const roleColor: Record<ProjectRole, string> = { OWNER: 'blue', EDITOR: 'teal', VIEWER: 'gray' }
const roleLabel: Record<ProjectRole, string> = { OWNER: 'Owner', EDITOR: 'Editor', VIEWER: 'Viewer' }

function ProjectListItem({ p, canNavigate }: { p: Project; canNavigate: boolean }) {
  return (
    <Box py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
      <Group align="flex-start" wrap="wrap" gap="xs">
        <ThemeIcon size="lg" variant="light" color={roleColor[p.myRole]} style={{ flexShrink: 0 }}>
          <TbFolders size={18} />
        </ThemeIcon>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" justify="space-between" wrap="wrap" align="flex-start">
            <Box style={{ minWidth: 0, flex: 1 }}>
              {canNavigate ? (
                <Anchor href={`/envmanager/${p.slug}`} size="sm" fw={600} style={{ wordBreak: 'break-word' }}>
                  {p.name}
                  <TbExternalLink size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                </Anchor>
              ) : (
                <Group gap={4} wrap="nowrap">
                  <Text size="sm" fw={600} style={{ wordBreak: 'break-word' }}>
                    {p.name}
                  </Text>
                  <TbLock size={12} color="var(--mantine-color-dimmed)" />
                </Group>
              )}
            </Box>
            <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
              <Badge color={roleColor[p.myRole]} variant="light" size="sm">
                {roleLabel[p.myRole]}
              </Badge>
              <Text size="xs" c="dimmed">
                {p._count.environments} env
              </Text>
            </Group>
          </Group>
          <Text size="xs" c="dimmed" ff="monospace">
            {p.slug}
          </Text>
          {p.description && (
            <Text size="xs" c="dimmed" lineClamp={2}>
              {p.description}
            </Text>
          )}
          {p.tags.length > 0 && (
            <Group gap={4} mt={2} wrap="wrap">
              {p.tags.map((t) => (
                <Badge key={t} size="xs" variant="dot" color="gray">
                  {t}
                </Badge>
              ))}
            </Group>
          )}
        </Stack>
      </Group>
    </Box>
  )
}

function ProjectCard({ p, canNavigate }: { p: Project; canNavigate: boolean }) {
  return (
    <Card withBorder padding="sm">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <ThemeIcon size="md" variant="light" color={roleColor[p.myRole]}>
            <TbFolders size={15} />
          </ThemeIcon>
          <Badge color={roleColor[p.myRole]} variant="light" size="sm">
            {roleLabel[p.myRole]}
          </Badge>
        </Group>
        <Stack gap={2}>
          {canNavigate ? (
            <Anchor href={`/envmanager/${p.slug}`} size="sm" fw={600} lineClamp={1}>
              {p.name}
              <TbExternalLink size={11} style={{ marginLeft: 3, verticalAlign: 'middle' }} />
            </Anchor>
          ) : (
            <Group gap={4} wrap="nowrap">
              <Text size="sm" fw={600} truncate>
                {p.name}
              </Text>
              <TbLock size={12} color="var(--mantine-color-dimmed)" />
            </Group>
          )}
          <Text size="xs" c="dimmed" ff="monospace" truncate>
            {p.slug}
          </Text>
        </Stack>
        {p.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {p.description}
          </Text>
        )}
        <Divider />
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {p._count.environments} env
          </Text>
          {p.tags.length > 0 && (
            <Group gap={4}>
              {p.tags.slice(0, 2).map((t) => (
                <Badge key={t} size="xs" variant="dot" color="gray">
                  {t}
                </Badge>
              ))}
            </Group>
          )}
        </Group>
      </Stack>
    </Card>
  )
}

export function ProfileProjectsSection({ role }: { role: string }) {
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(
    () => (localStorage.getItem('profile:projects:viewMode') as 'list' | 'grid') ?? 'list',
  )

  const { data, isLoading } = useQuery<{ projects: Project[] }>({
    queryKey: ['profile', 'projects'],
    queryFn: () => apiFetch('/api/envman/projects'),
  })

  const projects = data?.projects ?? []
  const canNavigate = role !== 'QC'

  const filtered = search.trim()
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.slug.toLowerCase().includes(search.toLowerCase()) ||
          p.description?.toLowerCase().includes(search.toLowerCase()),
      )
    : projects

  const setView = (v: 'list' | 'grid') => {
    setViewMode(v)
    localStorage.setItem('profile:projects:viewMode', v)
  }

  const ownerCount = projects.filter((p) => p.myRole === 'OWNER').length
  const editorCount = projects.filter((p) => p.myRole === 'EDITOR').length
  const viewerCount = projects.filter((p) => p.myRole === 'VIEWER').length

  if (isLoading)
    return (
      <Text c="dimmed" size="sm">
        Loading...
      </Text>
    )

  return (
    <Stack gap="md">
      {/* Header */}
      <Box>
        <Group justify="space-between" align="flex-start" mb={4}>
          <Group gap="xs">
            <TbFolders size={20} />
            <Text fw={700} size="lg">
              Projects
            </Text>
            <Badge variant="light" color="gray" size="sm">
              {projects.length}
            </Badge>
          </Group>
        </Group>
        {projects.length > 0 && (
          <Group gap="xs">
            {ownerCount > 0 && (
              <Badge size="xs" color="blue" variant="light">
                {ownerCount} Owner
              </Badge>
            )}
            {editorCount > 0 && (
              <Badge size="xs" color="teal" variant="light">
                {editorCount} Editor
              </Badge>
            )}
            {viewerCount > 0 && (
              <Badge size="xs" color="gray" variant="light">
                {viewerCount} Viewer
              </Badge>
            )}
          </Group>
        )}
      </Box>

      {projects.length === 0 ? (
        <Alert icon={<TbAlertCircle size={16} />} color="yellow" variant="light">
          Belum ada project yang di-assign. Hubungi SUPER_ADMIN untuk mendapat akses. Token dengan{' '}
          <code>scopes: []</code> tidak akan bisa mengakses apapun.
        </Alert>
      ) : (
        <>
          {/* Toolbar */}
          <Group gap="xs" wrap="nowrap">
            <TextInput
              size="xs"
              placeholder="Cari nama, slug, atau deskripsi..."
              leftSection={<TbSearch size={13} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ flex: 1, minWidth: 0 }}
              rightSection={
                search ? (
                  <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setSearch('')}>
                    <TbX size={12} />
                  </ActionIcon>
                ) : undefined
              }
            />
            <Group gap={4} wrap="nowrap">
              <Tooltip label="List view" withArrow>
                <ActionIcon
                  size="sm"
                  variant={viewMode === 'list' ? 'light' : 'subtle'}
                  color={viewMode === 'list' ? 'blue' : 'gray'}
                  onClick={() => setView('list')}
                >
                  <TbLayoutList size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Grid view" withArrow>
                <ActionIcon
                  size="sm"
                  variant={viewMode === 'grid' ? 'light' : 'subtle'}
                  color={viewMode === 'grid' ? 'blue' : 'gray'}
                  onClick={() => setView('grid')}
                >
                  <TbLayoutGrid size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          {filtered.length === 0 ? (
            <Text c="dimmed" size="xs" ta="center" py="sm">
              Tidak ada project yang cocok dengan pencarian.
            </Text>
          ) : viewMode === 'grid' ? (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
              {filtered.map((p) => (
                <ProjectCard key={p.id} p={p} canNavigate={canNavigate} />
              ))}
            </SimpleGrid>
          ) : (
            <Stack gap={0}>
              {filtered.map((p) => (
                <ProjectListItem key={p.id} p={p} canNavigate={canNavigate} />
              ))}
            </Stack>
          )}
        </>
      )}
    </Stack>
  )
}
