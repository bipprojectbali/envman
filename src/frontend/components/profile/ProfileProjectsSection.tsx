import { ActionIcon, Alert, Badge, Box, Group, SimpleGrid, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { TbAlertCircle, TbFolders, TbLayoutGrid, TbLayoutList, TbSearch, TbX } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/api'
import { type Project, ProjectCard, ProjectListItem } from './ProjectDisplayItems'

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
  const canNavigate = true

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
