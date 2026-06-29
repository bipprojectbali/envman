import {
  Badge,
  Box,
  Button,
  Code,
  Group,
  Paper,
  Skeleton,
  Tabs,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { createLazyFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  TbAlertTriangle,
  TbArrowLeft,
  TbChevronRight,
  TbClock,
  TbFiles,
  TbFolders,
  TbNote,
  TbTag,
  TbTerminal2,
  TbUsers,
  TbVariable,
} from 'react-icons/tb'
import { AliasesPanel } from '@/frontend/components/slug/AliasesPanel'
import { EnvironmentList } from '@/frontend/components/slug/EnvironmentList'
import { FilesPanel } from '@/frontend/components/slug/FilesPanel'
import { MembersPanel } from '@/frontend/components/slug/MembersPanel'
import { NotesPanel } from '@/frontend/components/slug/NotesPanel'
import { hasCapability, useSession } from '@/frontend/hooks/useAuth'
import { apiFetch } from '@/frontend/lib/api'
import { relativeDate, roleColor, tagColor } from '@/frontend/lib/project-utils'

export const Route = createLazyFileRoute('/envmanager/$slug/')({ component: ProjectDetailPage })

function ProjectDetailPage() {
  const { slug } = Route.useParams()
  const { tab, fileId, fileNew, viewFileId, aliasId, aliasNew, viewAliasId, noteId, noteNew, viewNoteId } =
    Route.useSearch()
  const navigate = useNavigate()
  const { data: sessionData } = useSession()
  const myUserId = sessionData?.user?.id
  const canCreateNote = hasCapability(sessionData?.user, 'note:create')

  const setTab = (t: string) =>
    navigate({
      to: '/envmanager/$slug',
      params: { slug },
      search: {
        tab: t as 'environments' | 'notes' | 'aliases' | 'files' | 'members',
        fileId,
        fileNew,
        viewFileId,
        aliasId,
        aliasNew,
        viewAliasId,
        noteId,
        noteNew,
        viewNoteId,
      },
    })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['envman', 'project', slug],
    queryFn: () => apiFetch(`/api/envman/projects/${slug}`),
    refetchInterval: 15000,
  })

  const project = data?.project
  const envs = project?.environments ?? []
  const totalVars = envs.reduce((s: number, e: { _count?: { vars: number } }) => s + (e._count?.vars ?? 0), 0)
  const memberCount: number = project?.members?.length ?? 0
  const projectTags: string[] = project?.tags ?? []

  const { data: notesData } = useQuery({
    queryKey: ['envman', 'notes', slug],
    queryFn: () => apiFetch<{ notes: unknown[] }>(`/api/envman/projects/${slug}/notes`),
    staleTime: 30_000,
  })
  const { data: aliasesData } = useQuery({
    queryKey: ['envman', 'aliases', slug],
    queryFn: () => apiFetch<{ aliases: unknown[] }>(`/api/envman/projects/${slug}/aliases`),
    staleTime: 60_000,
  })
  const { data: filesData } = useQuery({
    queryKey: ['envman', 'files', slug],
    queryFn: () => apiFetch<{ files: unknown[] }>(`/api/envman/projects/${slug}/files`),
    staleTime: 60_000,
  })
  const notesCount = notesData?.notes?.length ?? 0
  const aliasesCount = aliasesData?.aliases?.length ?? 0
  const filesCount = filesData?.files?.length ?? 0

  const myRole: string = project?.myRole ?? 'VIEWER'
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR'
  const isOwner = myRole === 'OWNER'

  return (
    <Box>
      {/* ─── Breadcrumb ─── */}
      <Group mb="md" gap={6} wrap="nowrap" align="center">
        <Button
          variant="subtle"
          size="xs"
          px={8}
          color="gray"
          component={Link}
          to="/envmanager"
          leftSection={<TbArrowLeft size={12} />}
          styles={{ root: { fontWeight: 400 } }}
        >
          Projects
        </Button>
        <TbChevronRight size={13} style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
        {isLoading ? (
          <Skeleton height={14} width={100} />
        ) : (
          <Text size="sm" fw={500} truncate>
            {project?.name ?? slug}
          </Text>
        )}
      </Group>

      {/* ─── Project Header ─── */}
      {isLoading ? (
        <Skeleton height={100} mb="md" radius="md" />
      ) : isError ? (
        <Box p="xl" ta="center" mb="md" style={{ border: '1px solid var(--mantine-color-red-5)' }}>
          <ThemeIcon size={48} radius="xl" variant="light" color="red" mx="auto" mb="sm">
            <TbAlertTriangle size={24} />
          </ThemeIcon>
          <Text fw={600} mb={4}>
            Gagal memuat project
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            {(error as Error)?.message ?? 'Project tidak ditemukan atau tidak ada akses.'}
          </Text>
          <Group justify="center" gap="xs">
            <Button size="xs" variant="subtle" color="gray" component={Link} to="/envmanager">
              Kembali ke daftar
            </Button>
            <Button size="xs" variant="light" color="red" onClick={() => refetch()}>
              Coba lagi
            </Button>
          </Group>
        </Box>
      ) : (
        project && (
          <Box
            p={{ base: 'sm', sm: 'md' }}
            mb="lg"
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-md)',
            }}
          >
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon
                size={48}
                radius="lg"
                variant="light"
                color={roleColor[myRole as keyof typeof roleColor] ?? 'gray'}
                style={{ flexShrink: 0 }}
              >
                <TbFolders size={22} />
              </ThemeIcon>

              <Box style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs" mb={4} wrap="wrap" align="center">
                  <Text fw={800} size="xl" lh={1.2} style={{ wordBreak: 'break-word' }}>
                    {project.name}
                  </Text>
                  <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                    <Code fz="xs">{slug}</Code>
                    <Badge size="sm" variant="light" color={roleColor[myRole as keyof typeof roleColor] ?? 'gray'}>
                      {myRole}
                    </Badge>
                  </Group>
                </Group>

                <Text
                  size="sm"
                  lh={1.6}
                  mb="xs"
                  c={project.description ? undefined : 'dimmed'}
                  fs={project.description ? undefined : 'italic'}
                >
                  {project.description || 'Belum ada deskripsi'}
                </Text>

                {projectTags.length > 0 && (
                  <Group gap={4} mb="xs">
                    {projectTags.map((t: string) => (
                      <Badge key={t} size="xs" variant="light" color={tagColor(t)} leftSection={<TbTag size={9} />}>
                        {t}
                      </Badge>
                    ))}
                  </Group>
                )}

                <Group
                  gap="xs"
                  wrap="wrap"
                  pt="xs"
                  mt={4}
                  style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
                >
                  <Tooltip label={`${envs.length} environment`} withArrow>
                    <Group gap={4} style={{ cursor: 'default' }}>
                      <TbVariable size={12} color="var(--mantine-color-primary)" />
                      <Text size="xs" fw={600}>{envs.length}</Text>
                      <Text size="xs" c="dimmed">env</Text>
                    </Group>
                  </Tooltip>
                  <Text size="xs" c="dimmed">·</Text>
                  <Tooltip label={`${totalVars} variabel di semua environment`} withArrow>
                    <Group gap={4} style={{ cursor: 'default' }}>
                      <Box w={6} h={6} bg="var(--mantine-color-teal-5)" style={{ borderRadius: 2 }} />
                      <Text size="xs" fw={600}>{totalVars}</Text>
                      <Text size="xs" c="dimmed">vars</Text>
                    </Group>
                  </Tooltip>
                  <Text size="xs" c="dimmed">·</Text>
                  <Tooltip label={`${memberCount} anggota project`} withArrow>
                    <Group gap={4} style={{ cursor: 'default' }}>
                      <TbUsers size={12} color="var(--mantine-color-blue-5)" />
                      <Text size="xs" fw={600}>{memberCount}</Text>
                      <Text size="xs" c="dimmed">member</Text>
                    </Group>
                  </Tooltip>
                  {project.createdAt && (
                    <>
                      <Text size="xs" c="dimmed">·</Text>
                      <Tooltip label={`Dibuat ${new Date(project.createdAt).toLocaleString('id-ID')}`} withArrow>
                        <Group gap={4} style={{ cursor: 'default' }}>
                          <TbClock size={12} color="var(--mantine-color-dimmed)" />
                          <Text size="xs" c="dimmed">{relativeDate(project.createdAt)}</Text>
                        </Group>
                      </Tooltip>
                    </>
                  )}
                </Group>
              </Box>
            </Group>
          </Box>
        )
      )}

      {/* ─── Tabs ─── */}
      {!isError && (
        <Tabs value={tab} onChange={(v) => setTab(v ?? 'environments')} variant="pills" color="gray">
          <Tabs.List mb="lg">
            <Tabs.Tab
              value="environments"
              leftSection={<TbVariable size={13} />}
              rightSection={
                !isLoading && envs.length > 0 ? (
                  <Badge size="xs" variant="light" color="primary" circle>
                    {envs.length}
                  </Badge>
                ) : undefined
              }
            >
              Environments
            </Tabs.Tab>
            <Tabs.Tab
              value="notes"
              leftSection={<TbNote size={13} />}
              rightSection={
                notesCount > 0 ? (
                  <Badge size="xs" variant="light" color="primary" circle>
                    {notesCount}
                  </Badge>
                ) : undefined
              }
            >
              Notes
            </Tabs.Tab>
            <Tabs.Tab
              value="aliases"
              leftSection={<TbTerminal2 size={13} />}
              rightSection={
                aliasesCount > 0 ? (
                  <Badge size="xs" variant="light" color="primary" circle>
                    {aliasesCount}
                  </Badge>
                ) : undefined
              }
            >
              Aliases
            </Tabs.Tab>
            <Tabs.Tab
              value="files"
              leftSection={<TbFiles size={13} />}
              rightSection={
                filesCount > 0 ? (
                  <Badge size="xs" variant="light" color="primary" circle>
                    {filesCount}
                  </Badge>
                ) : undefined
              }
            >
              Files
            </Tabs.Tab>
            <Tabs.Tab
              value="members"
              leftSection={<TbUsers size={13} />}
              rightSection={
                memberCount > 0 ? (
                  <Badge size="xs" variant="light" color="primary" circle>
                    {memberCount}
                  </Badge>
                ) : undefined
              }
            >
              Members
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="environments">
            <Paper withBorder p="md" radius="md">
              <EnvironmentList
                slug={slug}
                envs={envs}
                isLoading={isLoading}
                isOwner={isOwner}
                canEdit={canEdit}
                myRole={myRole}
              />
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="notes">
            <Paper withBorder p="md" radius="md">
              <NotesPanel
                slug={slug}
                canEdit={canEdit}
                canCreate={canCreateNote}
                isOwner={isOwner}
                myUserId={myUserId ?? ''}
              />
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="aliases">
            <Paper withBorder p="md" radius="md">
              <AliasesPanel slug={slug} isOwner={isOwner} />
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="files">
            <Paper withBorder p="md" radius="md">
              <FilesPanel slug={slug} isOwner={isOwner} myUserId={myUserId ?? ''} canEdit={canEdit} />
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="members">
            <Paper withBorder p="md" radius="md">
              <MembersPanel
                slug={slug}
                members={project?.members ?? []}
                environments={envs.map((e: { name: string }) => ({ name: e.name }))}
                isOwner={isOwner}
                myUserId={myUserId ?? ''}
                onRefresh={refetch}
              />
            </Paper>
          </Tabs.Panel>
        </Tabs>
      )}
    </Box>
  )
}
